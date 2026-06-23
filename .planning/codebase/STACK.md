---
last_mapped_commit: 2c3d37c71d954d4e34beaddd0b8eef115aae474e
---

# Technology Stack

**Analysis Date:** 2026-06-13

## Languages

**Primary:**
- TypeScript 5.x (`^5.9.3`) — all engine, app, and worker source in `src/`
- TSX (React JSX) — all UI apps under `src/apps/` (game, forge, launcher, debugger)

**Secondary:**
- JavaScript (CommonJS) — webpack config files in `webpack/*.js`, `webpack.config.js`, `main.js`
- GLSL (inline strings) — custom vertex/fragment shaders embedded in `src/shaders/`

## Runtime

**Environment:**
- Node.js 22 (Alpine) — used for build (`Dockerfile` `FROM node:22-alpine`)
- Browser (WebGL1 / Web Audio API) — primary runtime for the game engine
- Electron 41 (`^41.1.1`) — desktop shell runtime wrapping the browser build

**Package Manager:**
- npm
- Lockfile: `package-lock.json` (present)

## Frameworks

**Core (Engine):**
- THREE.js `0.149.0` (pinned exact) — 3D scene graph, WebGL renderer, post-processing pipeline
  - Used as a global `window.THREE` extern in browser builds; `node_modules/three/build/three.min.js` is copied to `dist/three.min.js` via `webpack/KotOR.js` CopyPlugin
  - Post-processing addons used: `EffectComposer`, `RenderPass`, `SSAARenderPass`, `ShaderPass`, `BloomPass`, `BokehPass` from `three/examples/jsm/postprocessing/`
  - Custom shader material pipeline layered on top in `src/shaders/` and `src/three/odyssey/`

**UI (Apps):**
- React `^19.2.3` + React DOM `^19.2.3` — all four browser apps (Game, Forge, Launcher, Debugger)
- React Bootstrap `^2.10.10` — component library used across apps
- react-contexify `^6.0.0` — context menus (Forge)
- react-draggable `^4.5.0` — draggable panels (Forge)
- react-use `^17.6.0` — React hooks utility library

**Code Editor:**
- Monaco Editor `^0.52.0` — embedded code editor in KotOR Forge
  - Integrated via `monaco-editor-webpack-plugin ^7.1.1` with JSON language support
  - Custom language services: `src/apps/forge/states/NWScriptLanguageService.ts`, `src/apps/forge/states/LYTLanguageService.ts`, `src/apps/forge/states/TXILanguageService.ts`
  - Wrapped via `react-monaco-editor ^0.59.0`

**Icons:**
- FontAwesome Free `^7.1.0` — icons in all UI apps (`@fortawesome/fontawesome-svg-core`, `free-solid-svg-icons`, `free-regular-svg-icons`, `free-brands-svg-icons`)

**Testing:**
- Jest `^30.2.0` — test runner (configured in `jest.config.js`)
- ts-jest `^29.4.6` — TypeScript transform for Jest
- Test command: `jest --verbose --coverage --no-cache ./src/tests`
- No test files currently exist in the repository (no `*.test.ts` files found)

**Build/Dev:**
- Webpack `^5.104.1` — bundler for all five build targets
- esbuild-loader `^4.4.2` — fast TypeScript/TSX transform used in all app webpack configs (replaces ts-loader for app bundles)
- ts-loader `^9.5.4` — available but used only in `tsconfig.json` base config reference
- webpack-dev-server `^5.2.4` — dev server on port 8080 with HMR
- WebpackBar `^7.0.0` — build progress display
- cross-env `^10.1.0` — cross-platform `NODE_ENV` setting
- tsc-watch `^7.2.0` — TypeScript watch mode for Electron dev
- electron-builder `^41.x` (invoked via `npx`) — desktop packaging (configured in `electron-builder.json`)
- TypeDoc `^0.28.15` — API documentation generation into `wiki/`

**Styling:**
- SASS/SCSS `^1.97.2` via `sass-loader ^16.0.6` — per-app stylesheet compilation
- Bootstrap `^5.3.8` — base CSS framework
- MiniCssExtractPlugin `^2.9.4` — CSS extraction in production builds

## Key Dependencies

**Critical (runtime):**
- `three ^0.149.0` — entire 3D rendering pipeline; pinned via `@types/three ^0.149.0`
- `idb-keyval ^6.2.2` — IndexedDB-backed key-value store used in `src/utility/ConfigClient.ts` and `src/apps/forge/states/ForgeState.ts` for persistent browser-side settings
- `p-limit ^7.3.0` — concurrency limiter used in `src/apps/game/GameInitializer.ts` to cap parallel file reads to 16
- `dxt-js ^0.0.3` (devDep, bundled) — DXT/S3TC texture decompression for TPC format parsing in `src/resource/TPCObject.ts` and re-exported from `src/KotOR.ts`
- `fft.js ^4.0.4` (devDep, bundled) — FFT used in audio visualizations (`src/apps/forge/components/tabs/tab-audio-player/`) and Bink audio DCT decode (`src/audio/binkaudio_dct.ts`)
- `path-browserify ^1.0.1` — browser polyfill for Node's `path` module (webpack `resolve.fallback`)
- `stream-browserify ^3.0.0` — browser polyfill for Node streams
- `monaco-editor ^0.52.0` — code editor (Forge only)

**Infrastructure:**
- `esprima ^4.0.1` + `escodegen ^2.1.0` (devDep, bundled) — JavaScript parser/code generator; used for NWScript decompiler AST output
- `bootstrap ^5.3.8` — CSS utility layer
- `@types/wicg-file-system-access ^2023.10.7` — TypeScript types for the browser File System Access API
- `user-agent-data-types ^0.4.2` — types for `navigator.userAgentData`
- `browserify-fs ^1.0.0` (devDep) — available but not the primary fs shim; Electron preload exposes `window.fs` directly

## Configuration

**TypeScript (multiple tsconfigs):**
- `tsconfig.json` — base config; all source, `target: ESNext`, `module: commonjs`, JSX react, `@/*` path alias
- `tsconfig.electron.json` — Electron main process: `target: ES6`, `types: [electron, node]`, outputs to `dist/electron/`
- `tsconfig.game.json` — Game app: scoped to `src/apps/game/**` + `src/apps/common/**`
- `tsconfig.forge.json` — Forge app: scoped to `src/apps/forge/**` + `src/apps/common/**`, `module: esnext`
- `tsconfig.launcher.json` — Launcher app: scoped to `src/apps/launcher/**` + `src/apps/common/**`
- `tsconfig.debugger.json` — Debugger app config
- `tsconfig.kotorjs.json` — KotOR.js library config

**Webpack (five build targets):**
- `webpack/KotOR.js` — main library bundle (`src/KotOR.ts`), server worker, bink-worker; outputs to `dist/`
- `webpack/Game.js` — Game React app; outputs to `dist/game/`
- `webpack/Forge.js` — Forge React app + texture worker; outputs to `dist/forge/`; includes Monaco plugin
- `webpack/Launcher.js` — Launcher React app; outputs to `dist/launcher/`
- `webpack/Debugger.js` — Debugger app; outputs to `dist/debugger/`
- `webpack/common.js` — shared rules (SCSS, CSS, assets), aliases (`@` → `src/`, `three` pinned), dev server config

**Key webpack externals (browser builds):**
- `fs` → `window.fs` (injected by Electron preload or by browser `GameFileSystem` stub)
- `three` → `window.THREE` (loaded as a script tag from `dist/three.min.js`)
- `@/apps/game/KotOR` → `KotOR` global in Game app
- `@/apps/forge/KotOR` → `KotOR` global in Forge app

**Build:**
- `electron-builder.json` — Electron packaging: Windows portable, macOS DMG, Linux AppImage; ASAR enabled; outputs to `release/`

**Dev Server:**
- Port 8080, HMR enabled, writes to disk (`devMiddleware.writeToDisk: true`), watches `dist/KotOR.js`, `dist/bink-worker.js`, `dist/server.js`

## Platform Requirements

**Development:**
- Node.js 22+
- npm (lockfile present)
- TypeScript compiler (`tsc`) for Electron main process
- Electron 41 for desktop dev mode

**Production targets:**
- **Browser (web):** Any WebGL1-capable browser with File System Access API support (Chrome 86+, Edge 86+)
- **Desktop (Electron):** Windows (portable EXE), macOS (DMG), Linux (AppImage)
- **Docker/nginx:** Multi-stage Dockerfile builds webpack production bundle → copies to `nginx:1.27-alpine` serving on port 80

**Licensing:**
- GPL-3.0 (all engine source)

---

*Stack analysis: 2026-06-13*
