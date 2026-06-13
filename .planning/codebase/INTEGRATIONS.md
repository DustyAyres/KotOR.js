---
last_mapped_commit: 2c3d37c71d954d4e34beaddd0b8eef115aae474e
---

# External Integrations

**Analysis Date:** 2026-06-13

> **Context:** KotOR.js has NO network-service integrations. There is no backend server, no database, no authentication provider, no analytics, and no SaaS APIs. All "integrations" are platform APIs (browser and Electron) and BioWare game-asset file formats accessed from the user's local game installation.

---

## File System Access

The central integration is a unified filesystem abstraction that bridges two very different platform APIs behind one interface.

**`GameFileSystem` (`src/utility/GameFileSystem.ts`):**
- **Browser path:** Uses the browser [File System Access API](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access) (`window.showDirectoryPicker`, `FileSystemDirectoryHandle`, `FileSystemFileHandle`). The user grants permission to their game install folder once; the handle is stored in `ApplicationProfile.directoryHandle`. File reads navigate handle trees rather than resolving paths.
- **Electron path:** Uses Node.js `fs` module bridged to the renderer via the Electron preload (`src/electron/preload.ts`), which exposes `window.fs` via `contextBridge`. Path strings are resolved relative to `ApplicationProfile.directory`.
- **Environment detection:** `ApplicationProfile.ENV` (`src/utility/ApplicationProfile.ts`) checks `window.location.origin === 'file://'` to distinguish `ApplicationEnvironment.ELECTRON` from `ApplicationEnvironment.BROWSER`.
- **TypeScript types:** `@types/wicg-file-system-access ^2023.10.7` provides File System Access API typings.

---

## BioWare Game Archive Formats

The engine reads BioWare Odyssey game data directly from a user's KotOR I or KotOR II installation. All parsers live in `src/resource/`.

| Format | Class | Purpose |
|--------|-------|---------|
| KEY | `src/resource/KEYObject.ts` | Master archive index; maps resource names → BIF locations |
| BIF | `src/resource/BIFObject.ts` | Binary archive container; holds bulk game assets |
| ERF | `src/resource/ERFObject.ts` | Encapsulated Resource Format; module-level archives |
| RIM | `src/resource/RIMObject.ts` | Room/area archive (subset of ERF) |
| GFF | `src/resource/GFFObject.ts`, `GFFField.ts`, `GFFStruct.ts` | Generic File Format — creature templates, area data, dialogue, items, etc. |
| TLK | `src/resource/TLKObject.ts`, `TLKString.ts` | String table (game dialogue/text) |
| 2DA | `src/resource/TwoDAObject.ts` | 2D data tables (rules, appearance stats, etc.) |
| TPC | `src/resource/TPCObject.ts` | BioWare compressed texture (wraps DXT/S3TC or raw RGBA); decoded with `dxt-js` |
| TGA | `src/resource/TGAObject.ts` | Uncompressed TGA textures |
| MDL | `src/loaders/MDLLoader.ts` + `src/odyssey/OdysseyModel.ts` | 3D model format with animations |
| LYT | `src/resource/LYTObject.ts` | Area layout (tile/room positions) |
| VIS | `src/resource/VISObject.ts` | Area visibility set |
| LIP | `src/resource/LIPObject.ts` | Lip-sync animation keyframes |
| LTR | `src/resource/LTRObject.ts` | Letter-frequency tables for name generation |
| SSF | `src/resource/SSFObject.ts` | Sound Set File |
| DLG | `src/resource/DLGObject.ts`, `DLGNode.ts` | Dialogue trees |
| BIK | `src/resource/BIKObject.ts` | Bink video container |
| ZIP | `src/resource/ZIPObject.ts` | ZIP archive (mod support) |

**Resource type registry:** `src/resource/ResourceTypes.ts` maps all file extension strings to numeric resource type IDs (e.g., `mdl: 2002`, `gff: 2037`, `tpc: 3007`).

**Manager layer:** `src/managers/` has one manager per archive type:
- `src/managers/KEYManager.ts` — loads `chitin.key` / `dialog.tlk`
- `src/managers/BIFManager.ts` — defers BIF reads through `KEYManager`
- `src/managers/ERFManager.ts` — per-module ERF mounts
- `src/managers/RIMManager.ts` — RIM archive access
- `src/managers/TLKManager.ts` — string table lookups
- `src/managers/TwoDAManager.ts` — rule-set table access

---

## Rendering Platform — WebGL1

**Renderer:** `THREE.WebGLRenderer` instantiated in `src/GameState.ts` (line 524).
- Canvas context created with `canvas.getContext('webgl')` (WebGL1 only; no WebGL2 or WebGPU).
- Options: `logarithmicDepthBuffer: true`, `alpha: true`, `antialias: false`, `preserveDrawingBuffer: false`.
- Post-processing via `three/examples/jsm/postprocessing/`: `EffectComposer`, `RenderPass`, `SSAARenderPass`, `ShaderPass`, `BloomPass`, `BokehPass`.
- Custom shader pass in `src/shaders/pass/OdysseyShaderPass.ts`.

**Custom shaders (`src/shaders/`):**
- `ShaderOdysseyModel.ts` — main model shader
- `ShaderOdysseyEmitter.ts` — particle emitter shader
- `ShaderAuroraGUI.ts` — GUI rendering shader
- `ShaderGrass.ts`, `ShaderGUIBackground.ts`, `ShaderGUIVoid.ts`, `ShaderFogOfWar.ts`
- Custom THREE.js material types in `src/three/odyssey/` (`OdysseyMaterialBuilder.ts`, `OdysseyCompressedTexture.ts`, `OdysseyTexture.ts`, `OdysseyEmitter3D.ts`)

**Secondary WebGL surface (Forge only):**
- `src/apps/forge/components/tabs/tab-bik-player/yuvWebGL.ts` — raw `WebGLRenderingContext` for YUV→RGBA color-space conversion during Bink video playback in Forge.

---

## Audio Platform — Web Audio API

**Engine:** `src/audio/AudioEngine.ts` — uses browser `AudioContext`, `GainNode`, `AudioBufferSourceNode`, `ConvolverNode` (reverb).
- Multi-channel gain graph with mute/unmute per `AudioEngineChannel`.
- Reverb effects via `src/audio/ReverbEngine.ts` and EAX preset data in `src/audio/EAXPresets.ts`.

**Audio formats decoded natively:**
- WAV / PCM — direct `AudioContext.decodeAudioData`
- ADPCM — custom decoder `src/audio/ADPCMDecoder.ts`
- BMU — BioWare MP3 container, extracted and passed to Web Audio
- Bink Audio (DCT) — `src/audio/binkaudio_dct.ts`, uses `fft.js` for inverse DCT

**Bink video audio/video decode:**
- `src/worker/bink-worker.ts` — Web Worker that demuxes BIK files (`src/video/bink-demuxer.ts`), decodes video frames (`src/video/binkvideo.ts`, YUV→RGBA), and decodes Bink DCT audio off the main thread.
- Worker protocol is message-based (`init` / `decode` / `stop` → `ready` / `frame` / `error`).

---

## Electron IPC

Used in the desktop (Electron) deployment only. The preload script and main process define a structured IPC contract.

**Preload (`src/electron/preload.ts`) exposes via `contextBridge`:**
- `window.fs` — Node.js `fs` module surface (open, read, readFile, writeFile, readdir, stat, statSync, mkdir, etc.)
- `window.dialog` — IPC-backed dialog wrappers:
  - `locateDirectoryDialog(profile)` → `ipcRenderer.invoke('locate-game-directory')`
  - `showOpenDialog(...)` → `ipcRenderer.invoke('open-file-dialog')`
  - `showSaveDialog(...)` → `ipcRenderer.invoke('save-file-dialog')`
- `window.electron` — window controls and launcher:
  - `minimize()` → `ipcRenderer.invoke('win-minimize')`
  - `maximize()` → `ipcRenderer.invoke('win-maximize')`
  - `locate_game_directory(profile)` → `ipcRenderer.invoke('locate-game-directory')`
  - `launchProfile(profile)` → `ipcRenderer.send('launch_profile')`
  - `openExternal(src)` → `shell.openExternal(src)`

**Main process (`src/electron/WindowManager.ts`) handles:**
- `locate-game-directory` → `dialog.showOpenDialog` (directory picker)
- `open-file-dialog` → `dialog.showOpenDialog`
- `save-file-dialog` → `dialog.showSaveDialog`
- `win-minimize` / `win-maximize` → `BrowserWindow` control
- `launch_profile` → creates new `ApplicationWindow` for a game profile
- `launch_executable` → launches original KotOR/TSL Windows EXE via `child_process.execFile`; on Linux uses `wine` (detected via `which wine`)
- `config-changed` → broadcasts to all open windows

**Window types:**
- `src/electron/LauncherWindow.ts` — launcher BrowserWindow
- `src/electron/ApplicationWindow.ts` — game/forge BrowserWindow per profile

---

## Web Workers

Three workers are bundled as separate Webpack entry points:

| Worker | Entry | Output | Purpose |
|--------|-------|--------|---------|
| KotOR Library server worker | `src/worker/server.ts` | `dist/server.js` | Stub for future game-server logic; receives binary `IPCMessage` frames |
| Bink video/audio decoder | `src/worker/bink-worker.ts` | `dist/bink-worker.js` | Off-main-thread Bink demux + decode |
| Texture decoder | `src/worker/worker-tex.ts` | (bundled into Forge) | TPC → DDS → RGBA pixel conversion for texture preview |

---

## Persistent Storage — IndexedDB (Browser Only)

**Library:** `idb-keyval ^6.2.2`

**Usage:**
- `src/utility/ConfigClient.ts` — persists game settings object under key `'app_settings'` via `get`/`set`
- `src/apps/forge/states/ForgeState.ts` — Forge application state persistence

No SQL database. No server-side storage. All persistence is local to the user's browser profile.

---

## External Process Launch (Electron Only)

The Electron main process can launch the original KotOR/TSL game executables directly:

- **Windows / macOS:** `child_process.execFile(exe_path)` in `src/electron/WindowManager.ts`
- **Linux:** `exec("wine ./<exe>")` after first checking `which wine`

This is a one-way launch; KotOR.js does not maintain communication with the launched process.

---

## Documentation Generation

**TypeDoc** (`^0.28.15`) generates API documentation from `src/KotOR.ts` into `wiki/`:
```
npm run typedoc
```
Plugins: `typedoc-github-wiki-theme ^2.1.0`, `typedoc-plugin-markdown ^4.9.0`

---

## CI/CD & Deployment

**Hosting options:**
- Docker + nginx (browser-only web app): `Dockerfile` multi-stage build → `nginx:1.27-alpine` on port 80; config at `docker/nginx.conf`
- Electron desktop packages: `electron-builder` (via `npm run electron:build`); produces portable Windows EXE, macOS DMG, Linux AppImage to `release/`

**CI Pipeline:** Not detected. No `.github/workflows/`, no `.circleci/`, no `Jenkinsfile`, no similar CI config found.

---

## Environment Configuration

**No `.env` files or secrets.** The engine reads no API keys or network credentials. The only "configuration" is:

- `process.env.NODE_ENV` — set by `cross-env` at build time to `development` or `production`
- `process.env.VERSION` / `VERSION` — injected by `webpack.DefinePlugin` from `package.json` version field
- Game install directory — supplied at runtime by the user through a native directory-picker dialog; stored in `ApplicationProfile.directory` (Electron) or `ApplicationProfile.directoryHandle` (browser) in memory only

---

*Integration audit: 2026-06-13*
