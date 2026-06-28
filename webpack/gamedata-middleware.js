const path = require('path');
const fs = require('fs');
const os = require('os');

/**
 * gamedata-middleware
 *
 * Dev-server middleware that exposes a user's installed KotOR / KotOR II game
 * directory over HTTP so the browser build can be driven headlessly in
 * ApplicationEnvironment.WEB_TEST mode (see src/utility/GameFileSystem.ts).
 *
 * Routes (all under the dev server, default http://localhost:8080):
 *   GET  /gamedata/<relpath>            -> raw file bytes, honors `Range:` for partial reads
 *   GET  /gamedata-meta/exists?path=    -> { exists, isDirectory, size }
 *   GET  /gamedata-meta/list?path=&recursive=&list_dirs=  -> string[] (readdir_fs contract)
 *   POST /gamedata-write?path=          -> writes body to the SCRATCH overlay (never the install)
 *   POST /gamedata-mkdir?path=          -> mkdir in the SCRATCH overlay
 *   POST /gamedata-unlink?path=         -> unlink in the SCRATCH overlay
 *
 * Reads use an overlay: the SCRATCH dir is checked first, then the real install.
 * Writes ALWAYS target SCRATCH, so tests can save games / write settings without
 * ever mutating the user's real install.
 *
 * Configure via env vars (the dir is game-agnostic — point it at K1 or K2):
 *   KOTOR_DIR / KOTOR2_DIR                   absolute path to the game install (read root)
 *   KOTOR_TEST_SCRATCH / KOTOR2_TEST_SCRATCH absolute path to a writable scratch dir (default: os tmp)
 * KOTOR_DIR / KOTOR_TEST_SCRATCH take precedence; the KOTOR2_* names are kept for
 * back-compat. Use a distinct scratch dir per game so K1 and K2 saves don't mix.
 */

const DEFAULT_GAME_DIR = 'D:\\Program Files (x86)\\Steam\\steamapps\\common\\Knights of the Old Republic II';

function getRoots() {
  const gameDir = process.env.KOTOR_DIR || process.env.KOTOR2_DIR || DEFAULT_GAME_DIR;
  const scratchDir = process.env.KOTOR_TEST_SCRATCH || process.env.KOTOR2_TEST_SCRATCH || path.join(os.tmpdir(), 'kotorjs-webtest-scratch');
  return { gameDir: path.resolve(gameDir), scratchDir: path.resolve(scratchDir) };
}

// Resolve a client-supplied relative path inside `root`, refusing any escape.
function safeJoin(root, rel) {
  const cleaned = String(rel || '').replace(/^[/\\]+/, '');
  const resolved = path.resolve(root, cleaned);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    return null;
  }
  return resolved;
}

// Read overlay: prefer the scratch copy, fall back to the install.
function resolveReadPath(rel) {
  const { gameDir, scratchDir } = getRoots();
  const scratchPath = safeJoin(scratchDir, rel);
  if (scratchPath && fs.existsSync(scratchPath)) return scratchPath;
  return safeJoin(gameDir, rel);
}

// Mirror src/utility/GameFileSystem.ts readdir_fs(): returns paths relative to
// the game root, prefixed with the requested dir, '/'-separated. Overlays scratch
// entries on top of install entries (deduped, case-insensitive).
function readdirContract(rel, opts) {
  const recursive = !!opts.recursive;
  const listDirs = !!opts.list_dirs;
  const { gameDir, scratchDir } = getRoots();

  const seen = new Set();
  const files = [];

  const walk = (resourcePath, depth) => {
    const candidates = [safeJoin(gameDir, resourcePath), safeJoin(scratchDir, resourcePath)].filter(Boolean);
    const dirEntries = new Map();
    let isDir = false;
    for (const abs of candidates) {
      let stat;
      try { stat = fs.statSync(abs); } catch { continue; }
      if (stat.isDirectory()) {
        isDir = true;
        for (const d of fs.readdirSync(abs, { withFileTypes: true })) {
          // de-dupe by lowercased name; first seen (scratch may override) wins shape
          const key = d.name.toLowerCase();
          if (!dirEntries.has(key)) dirEntries.set(key, d);
        }
      }
    }

    if (!isDir) {
      // resourcePath is a file, not a directory (matches readdir_fs error branch)
      if (!listDirs) pushUnique(resourcePath);
      return;
    }

    if (listDirs && depth > 0) pushUnique(resourcePath);

    if (depth < 1 || recursive) {
      for (const d of dirEntries.values()) {
        const childPath = resourcePath ? resourcePath + '/' + d.name : d.name;
        if (d.isDirectory()) {
          if (recursive) {
            walk(childPath, depth + 1);
          } else {
            pushUnique(childPath);
          }
        } else if (!listDirs) {
          pushUnique(childPath);
        }
      }
    }
  };

  const pushUnique = (p) => {
    const key = p.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    files.push(p);
  };

  walk(String(rel || '').replace(/^[/\\]+/, ''), 0);
  return files;
}

function serveFile(req, res) {
  let rel;
  try { rel = decodeURIComponent(req.path.replace(/^\/+/, '')); } catch { rel = req.path; }
  const file = resolveReadPath(rel);
  if (!file) { res.status(403).end('Forbidden'); return; }

  let stat;
  try { stat = fs.statSync(file); } catch { res.status(404).end('Not found: ' + rel); return; }
  if (stat.isDirectory()) { res.status(404).end('Is a directory: ' + rel); return; }

  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'no-store');

  const range = req.headers.range;
  if (range) {
    const m = /bytes=(\d+)-(\d*)/.exec(range);
    if (m) {
      const start = parseInt(m[1], 10);
      const end = m[2] ? Math.min(parseInt(m[2], 10), stat.size - 1) : stat.size - 1;
      if (start >= stat.size || start > end) {
        res.status(416).setHeader('Content-Range', `bytes */${stat.size}`).end();
        return;
      }
      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
      res.setHeader('Content-Length', end - start + 1);
      fs.createReadStream(file, { start, end }).pipe(res);
      return;
    }
  }

  res.setHeader('Content-Length', stat.size);
  fs.createReadStream(file).pipe(res);
}

function metaExists(req, res) {
  const rel = req.query.path || '';
  const file = resolveReadPath(rel);
  if (!file) { res.json({ exists: false }); return; }
  try {
    const stat = fs.statSync(file);
    res.json({ exists: true, isDirectory: stat.isDirectory(), size: stat.size });
  } catch {
    res.json({ exists: false });
  }
}

function metaList(req, res) {
  const rel = req.query.path || '';
  const opts = {
    recursive: req.query.recursive === '1' || req.query.recursive === 'true',
    list_dirs: req.query.list_dirs === '1' || req.query.list_dirs === 'true',
  };
  try {
    res.json(readdirContract(rel, opts));
  } catch (e) {
    res.status(500).json({ error: String(e && e.message || e) });
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function writeFileScratch(req, res) {
  const { scratchDir } = getRoots();
  const target = safeJoin(scratchDir, req.query.path || '');
  if (!target) { res.status(403).json({ ok: false, error: 'Forbidden' }); return; }
  try {
    const body = await readBody(req);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, body);
    res.json({ ok: true, bytes: body.length });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
}

function mkdirScratch(req, res) {
  const { scratchDir } = getRoots();
  const target = safeJoin(scratchDir, req.query.path || '');
  if (!target) { res.status(403).json({ ok: false, error: 'Forbidden' }); return; }
  try {
    // Always recursive in the scratch overlay: the scratch root itself may not
    // exist yet, and a non-recursive mkdir would ENOENT on a missing parent.
    fs.mkdirSync(target, { recursive: true });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
}

function unlinkScratch(req, res) {
  const { scratchDir } = getRoots();
  const target = safeJoin(scratchDir, req.query.path || '');
  if (!target) { res.status(403).json({ ok: false, error: 'Forbidden' }); return; }
  try {
    if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e && e.message || e) });
  }
}

/**
 * Registers the gamedata routes on a webpack-dev-server v5 instance.
 * Call from `setupMiddlewares(middlewares, devServer)`.
 */
function attachGameDataMiddleware(devServer) {
  if (!devServer || !devServer.app) {
    throw new Error('attachGameDataMiddleware: devServer.app (express) is required');
  }
  const { gameDir, scratchDir } = getRoots();
  console.log('[gamedata] WEB_TEST backend serving game dir:', gameDir);
  console.log('[gamedata] WEB_TEST scratch (writes) dir:    ', scratchDir);

  const app = devServer.app;
  app.get('/gamedata-meta/exists', metaExists);
  app.get('/gamedata-meta/list', metaList);
  app.post('/gamedata-write', writeFileScratch);
  app.post('/gamedata-mkdir', mkdirScratch);
  app.post('/gamedata-unlink', unlinkScratch);
  app.use('/gamedata', serveFile);
}

module.exports = { attachGameDataMiddleware };
