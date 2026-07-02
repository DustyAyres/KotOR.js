/**
 * KotOR.js Co-op Relay Server
 *
 * A game-agnostic WebSocket relay for host-authoritative co-op sessions.
 * The HOST browser runs the authoritative simulation; CLIENT browsers send
 * commands and receive state. This relay only routes frames between them —
 * it never parses game messages.
 *
 * Wire format (relay envelope, prepended to every binary frame):
 *   [peerId:u16 LE][payload = IPCMessage bytes]
 *   - frame arriving AT the host:   peerId = sender client id
 *   - frame sent BY the host:       peerId = target client id (BROADCAST = all)
 *   - frame arriving AT a client:   peerId = sender (always HOST_PEER_ID)
 *   - peerId CONTROL: payload is a UTF-8 JSON relay-control message, e.g.
 *       {event:'welcome'|'joined'|'left'|'host-left'|'error', peerId, session}
 *
 * Usage: node scripts/coop-server.js [--port 8090]
 * Connect: ws://<addr>:8090/?role=host[&session=CODE]
 *          ws://<addr>:8090/?role=client&session=CODE
 */

const http = require('http');
const { WebSocketServer } = require('ws');

const HOST_PEER_ID = 0x0000;
const BROADCAST = 0xffff;
const CONTROL = 0xfffe;
const MAX_CLIENTS = 2; // 3-player co-op: host + 2

const args = process.argv.slice(2);
const portIdx = args.indexOf('--port');
const PORT = portIdx !== -1 ? parseInt(args[portIdx + 1], 10) : (parseInt(process.env.COOP_PORT, 10) || 8090);

/** session code -> { code, host: ws|null, clients: Map<peerId, ws>, nextPeerId } */
const sessions = new Map();

const now = () => new Date().toISOString();
const log = (...a) => console.log(`[coop-relay ${now()}]`, ...a);

function getOrCreateSession(code) {
  let s = sessions.get(code);
  if (!s) {
    s = { code, host: null, clients: new Map(), nextPeerId: 1 };
    sessions.set(code, s);
  }
  return s;
}

/** Build a relay envelope frame. payload: Buffer|Uint8Array */
function envelope(peerId, payload) {
  const out = Buffer.allocUnsafe(2 + payload.length);
  out.writeUInt16LE(peerId, 0);
  out.set(payload, 2);
  return out;
}

function controlFrame(obj) {
  return envelope(CONTROL, Buffer.from(JSON.stringify(obj), 'utf8'));
}

function safeSend(ws, frame) {
  if (ws && ws.readyState === ws.OPEN) {
    ws.send(frame, { binary: true });
    return true;
  }
  return false;
}

const server = http.createServer((req, res) => {
  // Status endpoint for harness checks / debugging.
  const summary = [...sessions.values()].map((s) => ({
    session: s.code,
    hostConnected: !!s.host,
    clients: [...s.clients.keys()],
  }));
  res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify({ ok: true, port: PORT, sessions: summary }));
});

const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const role = url.searchParams.get('role');
  const code = (url.searchParams.get('session') || 'DEFAULT').toUpperCase();

  if (role !== 'host' && role !== 'client') {
    safeSend(ws, controlFrame({ event: 'error', message: `invalid role '${role}'` }));
    ws.close(4000, 'invalid role');
    return;
  }

  const session = getOrCreateSession(code);
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });

  if (role === 'host') {
    if (session.host) {
      safeSend(ws, controlFrame({ event: 'error', message: `session '${code}' already has a host` }));
      ws.close(4001, 'host exists');
      return;
    }
    session.host = ws;
    ws.coop = { role, session, peerId: HOST_PEER_ID };
    log(`host connected to session '${code}' (${req.socket.remoteAddress})`);
    safeSend(ws, controlFrame({ event: 'welcome', peerId: HOST_PEER_ID, session: code }));
    // Announce clients that connected before the host (waiting room).
    for (const peerId of session.clients.keys()) {
      safeSend(ws, controlFrame({ event: 'joined', peerId, session: code }));
    }
  } else {
    if (session.clients.size >= MAX_CLIENTS) {
      safeSend(ws, controlFrame({ event: 'error', message: `session '${code}' is full` }));
      ws.close(4002, 'session full');
      return;
    }
    const peerId = session.nextPeerId++;
    session.clients.set(peerId, ws);
    ws.coop = { role, session, peerId };
    log(`client peer ${peerId} connected to session '${code}' (${req.socket.remoteAddress})`);
    safeSend(ws, controlFrame({ event: 'welcome', peerId, session: code, hostConnected: !!session.host }));
    if (session.host) {
      safeSend(session.host, controlFrame({ event: 'joined', peerId, session: code }));
    }
  }

  ws.on('message', (data, isBinary) => {
    if (!isBinary || data.length < 2) return;
    const { role, session, peerId } = ws.coop;
    if (role === 'host') {
      // Host frames carry a TARGET peer id; rewrite to sender (host) id and route.
      const target = data.readUInt16LE(0);
      const routed = Buffer.from(data); // copy so we can rewrite the header
      routed.writeUInt16LE(HOST_PEER_ID, 0);
      if (target === BROADCAST) {
        for (const clientWs of session.clients.values()) safeSend(clientWs, routed);
      } else {
        safeSend(session.clients.get(target), routed);
      }
    } else {
      // Client frames always go to the host, stamped with the sender's peer id.
      const routed = Buffer.from(data);
      routed.writeUInt16LE(peerId, 0);
      safeSend(session.host, routed);
    }
  });

  ws.on('close', () => {
    const { role, session, peerId } = ws.coop || {};
    if (!session) return;
    if (role === 'host') {
      log(`host left session '${session.code}'`);
      session.host = null;
      for (const clientWs of session.clients.values()) {
        safeSend(clientWs, controlFrame({ event: 'host-left', session: session.code }));
      }
      // Keep the session so clients can linger; it dies when everyone leaves.
    } else {
      log(`client peer ${peerId} left session '${session.code}'`);
      session.clients.delete(peerId);
      if (session.host) {
        safeSend(session.host, controlFrame({ event: 'left', peerId, session: session.code }));
      }
    }
    if (!session.host && session.clients.size === 0) sessions.delete(session.code);
  });

  ws.on('error', (err) => log(`ws error (${role}):`, err.message));
});

// Heartbeat: drop dead connections so 'left'/'host-left' fire reliably.
const heartbeat = setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 15000);
wss.on('close', () => clearInterval(heartbeat));

server.listen(PORT, () => log(`listening on ws://0.0.0.0:${PORT} (status: http://localhost:${PORT}/)`));
