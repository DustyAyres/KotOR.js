---
last_mapped_commit: 2c3d37c71d954d4e34beaddd0b8eef115aae474e
---

# Codebase Concerns

**Analysis Date:** 2026-06-13

---

## Tech Debt

**No Automated Test Suite (Critical):**
- Issue: `npm test` targets `./src/tests` which does not exist. Zero `*.test.ts` or `*.spec.ts` files exist anywhere in the repo. Jest and ts-jest are configured in `jest.config.js` and listed as `dependencies` in `package.json`, but the infrastructure is entirely unused. The `tsconfig.json` even excludes `src/**/*.spec.ts` — indicating awareness of the placeholder without follow-through.
- Files: `jest.config.js`, `package.json` (line 20: `"test": "jest --verbose --coverage --no-cache ./src/tests"`), `tsconfig.json`
- Impact: No regression safety net for a ~90,000-line engine rewrite. Any refactor or bug fix has no automated verification. Regressions can only be found by manually running the game.
- Fix approach: Create `src/tests/` directory, begin with unit tests for deterministic subsystems — binary parsers (`src/utility/binary/BinaryReader.ts`), math utilities, resource parsers (`src/resource/GFFObject.ts`, `src/resource/TwoDAObject.ts`).

**`strictNullChecks: false` (High):**
- Issue: `tsconfig.json` line 16 disables null safety. The TypeScript compiler does not catch null/undefined dereferences across the entire ~90,000-line codebase. Most `static` fields on `GameState` are declared without initializers and would be `undefined` until engine initialization, but the compiler accepts all accesses without guards.
- Files: `tsconfig.json` (line 16), `src/GameState.ts` (lines 200–290: multiple uninitialized static fields), `src/module/ModuleCreature.ts` (4,580 lines, zero `throw`/error statements)
- Impact: Null dereference bugs are the most common runtime crash source; TypeScript's primary value for a project of this size is lost.
- Fix approach: Enable `strictNullChecks: true` in `tsconfig.json`; expect several hundred type errors that must be resolved progressively — start by adding `!` assertions on known-initialized fields, then properly type-guard the rest.

**Pervasive `any` Type Usage (Medium):**
- Issue: 952 instances of `: any` annotations across `src/`. This is separate from the null safety concern — even with `noImplicitAny: true`, explicit `any` casts are used freely, particularly in Electron bridge parameters and module object collections.
- Files: `src/electron/preload.ts` (nearly all bridge parameters typed as `any`), `src/module/ModuleObject.ts`, `src/module/ModuleArea.ts`, `src/GameState.ts` (line 83: `static eventListeners: any`)
- Impact: Type inference chains break at `any` boundaries. Bugs in data passed across IPC or between engine subsystems are invisible to the compiler.
- Fix approach: Prioritize typing the Electron bridge interfaces in `src/electron/preload.ts`, then work inward to the module object hierarchy.

**`@deprecated` APIs Still in Active Use (Low):**
- Issue: 17 `@deprecated` annotations across 8 files. Several deprecated fields (`expansionList`, `globalVariableList`, `hak`, `cutSceneList`, `creatorId`) are copied verbatim between `src/module/Module.ts` and `src/apps/forge/module-editor/ForgeModule.ts`, suggesting the deprecated path is still serialized/deserialized.
- Files: `src/module/Module.ts` (lines 161–184), `src/apps/forge/module-editor/ForgeModule.ts` (lines 88–111), `src/loaders/TemplateLoader.ts` (entire class marked deprecated), `src/engine/rules/SWFeatGain.ts`
- Impact: `TemplateLoader` class deprecation in particular implies a replacement exists but both code paths may be active.
- Fix approach: Audit whether the deprecated `TemplateLoader` class callers have migrated, then remove. Clean up the NWN-era deprecated struct fields if they are not parsed from game files.

**KotOR 2 NWScript Coverage Gap (Medium):**
- Issue: `src/nwscript/NWScriptDefK1.ts` (8,676 lines) defines 577 script functions for KotOR I. `src/nwscript/NWScriptDefK2.ts` (6,279 lines) defines only 24. This strongly suggests KotOR 2 scripting is largely unimplemented.
- Files: `src/nwscript/NWScriptDefK2.ts`, `src/nwscript/NWScriptDefK1.ts`
- Impact: KotOR 2 gameplay scripting will silently no-op for the vast majority of script calls, producing broken game logic without error messages.
- Fix approach: This is a scope item rather than a bug — document clearly in project status and systematically port K1 function implementations to K2 where the API is identical.

**NWScript Stack State Save/Restore is a Stub (Medium):**
- Issue: `NWScriptStack.storeState()` and `restoreState()` at lines 193 and 202 are commented `//TODO:: Actually implement this properly`. The `storeState` method assigns `localStack` and `globalStack` to the same array (`this.stack`). `restoreState` then clobbers `this.stack` twice with the same value. The state snapshot is incorrect and the restore would not work.
- Files: `src/nwscript/NWScriptStack.ts` (lines 186–203)
- Impact: Any NWScript that saves/restores stack context (e.g., subroutine calls needing isolated stack frames) may produce incorrect results.
- Fix approach: Implement proper stack snapshot via `this.stack.slice()` in `storeState`, then restore the clone in `restoreState`.

**Unimplemented NWScript Functions with Silent No-ops (Medium):**
- Issue: Several NWScript functions are registered with `//TODO` bodies that either return `0` silently or return nothing. Examples: opcode 366 (line 4543), `GetIsLinkImmune` opcode 390 (line 4794), and faction manipulation opcodes 8266–8277 (missing faction reassignment and combat-clear logic).
- Files: `src/nwscript/NWScriptDefK1.ts` (lines 4543, 4794, 8266–8277)
- Impact: Game scripts calling these functions will proceed without errors but with incorrect game state (wrong combat behavior, faction system bypassed).
- Fix approach: Add a `console.warn('NWScript: [FunctionName] not implemented')` guard as a minimum so missing implementations are surfaced at runtime.

**`deltaTimeFixed` Accumulator Without Consumer (Low):**
- Issue: `GameState.Update()` (line 1177) accumulates `deltaTimeFixed += (1/60)` every frame unconditionally, and it is reset during module load (line 505), but no subsystem appears to consume it for fixed-step simulation. The variable accrues indefinitely during gameplay.
- Files: `src/GameState.ts` (lines 1177, 205, 505)
- Impact: If a fixed-step physics or animation system is ever added, the accumulated value will be astronomically large after any play session, requiring a reset guard.
- Fix approach: Either remove `deltaTimeFixed` if no fixed-step system exists, or implement proper fixed-step accumulation with a drain loop.

---

## Known Bugs

**`electron.isMac()` Missing `return` Statement:**
- Symptoms: `window.electron.isMac()` always returns `undefined` in the renderer, regardless of platform. The expression `process.platform === 'darwin'` is evaluated but not returned.
- Files: `src/electron/preload.ts` (line 148)
- Trigger: Any code path that calls `window.electron.isMac()` to check platform.
- Workaround: None — callers receive `undefined` which is falsy, effectively always treating the platform as non-Mac.

**BinaryReader Bounds Check Only Guards First Byte of Multi-Byte Reads (Low):**
- Symptoms: `readInt16()`, `readUInt16()`, `readInt32()`, `readUInt32()`, `readSingle()` all check `this.position >= this.buffer.length` before reading, but only verify that the start position is within bounds. A read of 4 bytes starting at `buffer.length - 1` will pass the check but `DataView.getInt32()` will throw a `RangeError` at runtime.
- Files: `src/utility/binary/BinaryReader.ts` (lines 118–173, 268–275)
- Trigger: Truncated or malformed game asset files.
- Workaround: The parsers that call BinaryReader are generally wrapped in `try/catch` at the top level in `GFFObject.ts`, so truncated files will likely produce a caught error rather than a crash — but the error is silent.

**`exec()` Shell Injection on Linux via Unescaped Path (Security/Bug):**
- Symptoms: On Linux, `WindowManager.ts` constructs a shell command via template literal: `` exec(`cd ${cwd.dir} && wine ./${cwd.base}`, ...) ``. A game executable path containing shell metacharacters (spaces, semicolons, backticks) could cause unintended shell behavior.
- Files: `src/electron/WindowManager.ts` (line 145)
- Trigger: A user-provided game install path containing shell metacharacters on Linux.
- Workaround: The path originates from Electron's `dialog.showOpenDialog`, so exploitation requires a maliciously crafted directory name — limited risk in practice, but should be fixed.

---

## Security Considerations

**Full `fs` Module Exposed to Renderer via `contextBridge` (Medium):**
- Risk: `src/electron/preload.ts` exposes the full Node.js `fs` module to the renderer as `window.fs` — including `open`, `read`, `readFile`, `writeFile`, `createReadStream`, `createWriteStream`, `readdir`, `mkdir`, `rmdir`, `stat`, `statSync`, `exists`. Any renderer-side JavaScript can read or write arbitrary paths on the user's filesystem.
- Files: `src/electron/preload.ts` (lines 38–143), `webpack/Game.js` (line 53: `fs: 'window.fs'`), `webpack/KotOR.js` (line 74: `fs: 'window.fs'`), `webpack/Forge.js` (line 60: `fs: 'window.fs'`)
- Current mitigation: `contextIsolation: true` and `nodeIntegration: false` are set on `ApplicationWindow`, meaning this exposure is intentional and controlled by the preload. There is no XSS vector from external URLs since the app loads local files only.
- Recommendations: Scope the exposed API to only the operations the game actually needs (e.g., read-only access to game directory, write access only to the saves subdirectory). Replace the raw `fs` passthrough with path-validated IPC handlers on the main process side.

**`nodeIntegration: true` on LauncherWindow (Medium):**
- Risk: `LauncherWindow.ts` sets `nodeIntegration: true` (line 29) while `contextIsolation: true` is also set (line 32). With Electron 12+, `nodeIntegration: true` is largely nullified when `contextIsolation: true` is also present, so Node APIs are not directly accessible in the renderer. However, the combination is a configuration smell — it's non-standard and confusing.
- Files: `src/electron/LauncherWindow.ts` (lines 29–33)
- Current mitigation: `contextIsolation: true` provides isolation.
- Recommendations: Set `nodeIntegration: false` to match `ApplicationWindow.ts` and eliminate ambiguity.

**`shell.openExternal` Without URL Validation (Low):**
- Risk: `src/electron/preload.ts` (line 175) exposes `window.electron.openExternal(src, options)` which calls `shell.openExternal(src, options)` directly with no URL scheme validation. A renderer bug or injected script could open arbitrary protocol handlers (e.g., `file://`, `steam://`, custom schemes).
- Files: `src/electron/preload.ts` (lines 174–176)
- Current mitigation: The launcher URL handler in `LauncherWindow.ts` restricts `openExternal` to `https://` URLs at the `setWindowOpenHandler` level, but the preload-exposed function has no such restriction.
- Recommendations: Validate that `src` starts with `https://` or a known-safe scheme before calling `shell.openExternal`.

**Binary Parsing of User-Provided Game Files Without Fuzzing (Low):**
- Risk: `src/utility/binary/BinaryReader.ts` and all `*Object.ts` resource parsers (`src/resource/GFFObject.ts`, `src/resource/BIFObject.ts`, `src/resource/ERFObject.ts`, `src/resource/RIMObject.ts`, etc.) parse binary formats from files the user selects from disk. There is no fuzzing infrastructure and no formal bounds validation beyond the single-byte position guard in `BinaryReader`.
- Files: `src/utility/binary/BinaryReader.ts`, `src/resource/GFFObject.ts`, `src/resource/BIFObject.ts`
- Current mitigation: Top-level `try/catch` blocks in `GFFObject.ts` absorb parser exceptions. The Electron sandbox (`sandbox: false`) and full-trust renderer mean a parser exploit would have significant local impact.
- Recommendations: This is primarily a robustness concern for a local app rather than a remote attack surface. Add length guards for multi-byte reads in `BinaryReader`, and ensure all parsers return graceful errors rather than silently producing corrupt state.

---

## Performance Bottlenecks

**SSAARenderPass Instantiated but Commented Out (Low — latent):**
- Problem: `GameState.ts` line 678 constructs an `SSAARenderPass` (Super Sample Anti-Aliasing — renders the scene at N× resolution then downsamples). It is commented out from the composer chain at line 711, so it does not currently run. However, the object is created and held in memory, and if re-enabled would be extremely expensive on typical hardware.
- Files: `src/GameState.ts` (lines 278, 678, 711)
- Cause: SSAA is the most computationally expensive AA method; unsuitable for a real-time engine without quality level controls.
- Improvement path: If AA is desired, replace with FXAA or TAA via a `ShaderPass`. Remove the `SSAARenderPass` instance if it will not be used.

**Per-Frame Texture Queue Processing Without Back-pressure (Medium):**
- Problem: In `GameState.Update()` (line 1205), the texture loader queue is drained each frame by calling `TextureLoader.LoadQueue()` whenever `loadingTextures` is false and the queue is non-empty. During area transitions or heavy scene loads, this can queue hundreds of textures that all begin loading simultaneously.
- Files: `src/GameState.ts` (lines 1205–1210), `src/loaders/TextureLoader.ts` (line 180: `LoadQueue`)
- Cause: `LoadQueue` processes the entire queue snapshot in one `async` batch per frame cycle, with no per-frame budget or concurrency limit within the queue itself. (`p-limit` with `fsLimit(16)` is only used in `GameInitializer.ts`, not in the per-frame texture loader.)
- Improvement path: Apply `p-limit` concurrency in `TextureLoader.LoadQueue` or process a fixed number of queue items per frame rather than the whole queue.

**`OdysseyEmitter3D` Update Loop on All Particles Every Frame (Medium):**
- Problem: `OdysseyEmitter3D.ts` (1,964 lines) manages particle systems. Each emitter iterates all live particles every frame in `update()`. There is no spatial culling or LOD system — emitters outside the visible frustum still tick every frame.
- Files: `src/three/odyssey/OdysseyEmitter3D.ts`
- Cause: Consistent with the overall design — no visibility culling for particle systems.
- Improvement path: Check emitter position against `GameState.viewportFrustum` before ticking, or suspend emitters when `this.visible === false`.

**ModuleArea Per-Frame Update Iterates All Collections Unconditionally (Low):**
- Problem: `src/module/ModuleArea.ts` update loop (around line 410–500) iterates creatures, doors, placeables, triggers, encounters, rooms, and spell instances every frame with plain `for` loops and no distance-based LOD or sleep scheduling for idle objects.
- Files: `src/module/ModuleArea.ts`
- Cause: Simple, correct-first design. Normal for early development.
- Improvement path: Add a distance threshold to skip full update for objects far from the player; implement an active/inactive bucket pattern for creatures not currently in combat or dialogue.

---

## Fragile Areas

**`GameState` God-Object / Global Mutable State (Critical):**
- Files: `src/GameState.ts` (1,479 lines, ~100+ `static` fields)
- Why fragile: `GameState` is a single class with ~100 static fields holding the entire engine's mutable runtime state — renderer, cameras, scene graph, all managers (20+), module reference, save game, audio emitter, render passes, and timing. It is imported by 212 files (`import { GameState } from "@/GameState"` found in 212 `.ts` files) and referenced 3,519 times across `src/`. Every subsystem depends directly on `GameState` statics, making the engine impossible to instantiate twice, impossible to unit test in isolation, and producing implicit coupling between every system in the engine.
- Safe modification: Any change to a `GameState` static field name requires a global rename across 212+ files. Changes to initialization order in `GameState.initialize()` can silently break subsystems that read state before it is set.
- Test coverage: Zero — no test exercises any `GameState` method.

**`ModuleCreature.ts` — Largest Business Logic File with No Error Handling (High):**
- Files: `src/module/ModuleCreature.ts` (4,580 lines)
- Why fragile: This file implements the complete creature AI, combat, animation, and stat systems. It has zero `throw` or `Error` statements — all failure modes are silent. The per-frame `update()` method is called for every creature every frame. Bugs in this file produce invisible incorrect behavior rather than catchable errors.
- Safe modification: Any change to combat calculations, action processing, or stat reads must be manually play-tested. There is no isolated test for any creature behavior.

**`NWScriptDefK1.ts` — 8,676-Line Monolithic Opcode Table (Medium):**
- Files: `src/nwscript/NWScriptDefK1.ts` (8,676 lines)
- Why fragile: All 577+ NWScript opcodes are defined as inline anonymous functions in a single object literal. Finding and modifying a specific opcode requires knowing its numeric ID or name. Adding a new opcode requires inserting into the correct position in this file. The `//TODO` stubs (lines 4543, 4794, 8266–8277) are easy to miss.
- Safe modification: Always search by opcode comment name rather than numeric key. Changes to shared infrastructure (GameState, effect factories) used inside opcode bodies require checking all 577 function bodies for impact.

**`OdysseyModel3D.ts` and `OdysseyEmitter3D.ts` — Large THREE.js Internal Coupling (Medium):**
- Files: `src/three/odyssey/OdysseyModel3D.ts` (1,737 lines), `src/three/odyssey/OdysseyEmitter3D.ts` (1,964 lines)
- Why fragile: Both files use deep internal THREE.js APIs imported from `three/examples/jsm/*`. THREE.js `examples/jsm` modules are explicitly not part of the stable API and change between versions. The project is pinned to `three: ^0.149.0` (with semver range `^` meaning any 0.149.x). Upgrading to any minor THREE.js release risks breaking `EffectComposer`, `BloomPass`, `SSAARenderPass`, `BufferGeometryUtils`, and `Lensflare` import paths.
- Safe modification: Do not upgrade `three` without verifying all `three/examples/jsm` import paths. The `BloomPass` import (`three/examples/jsm/postprocessing/BloomPass`) was removed from THREE.js in r152; upgrading past 0.149.x will break the build.

**`LauncherWindow` NodeIntegration + ContextIsolation Combination (Low):**
- Files: `src/electron/LauncherWindow.ts` (line 29)
- Why fragile: Setting `nodeIntegration: true` alongside `contextIsolation: true` is an unusual combination. Electron's behavior here has changed across versions. Testing that the launcher still works after Electron upgrades requires re-verifying this interaction.

---

## Scaling Limits

**Single-threaded JavaScript Render Loop:**
- Current capacity: All game logic, AI updates, resource parsing, and rendering run on the main JavaScript thread via `requestAnimationFrame`. Web Workers are used only for texture (`src/worker/worker-tex.ts`) and Bink video (`src/worker/bink-worker.ts`) decoding.
- Limit: CPU-bound work (pathfinding for many creatures, complex NWScript execution, large particle systems) will cause frame drops on the single thread. There is no job scheduler or work-stealing queue.
- Scaling path: Move pathfinding computation to a Web Worker; use the existing server worker (`src/worker/server.ts`) as the basis for offloading script execution.

---

## Dependencies at Risk

**`three: ^0.149.0` — Version Lock-in with `examples/jsm` Coupling:**
- Risk: The engine uses `BloomPass` from `three/examples/jsm/postprocessing/BloomPass` which was removed in THREE.js r152. The `^0.149.0` semver range in `package.json` (line 97 of `dependencies`) would not pull in r152, but a deliberate upgrade to any newer minor version requires a port of the post-processing chain. All 14 `three/examples/jsm` import sites listed across `src/GameState.ts`, `src/gui/GUIControl.ts`, `src/module/ModuleRoom.ts`, `src/shaders/pass/OdysseyShaderPass.ts`, and `src/three/odyssey/OdysseyModel3D.ts` must be audited on any THREE upgrade.
- Files: `package.json` (line 97), `src/GameState.ts` (lines 46–54)
- Impact: Upgrade is non-trivial without a dedicated migration phase.
- Migration plan: Switch to THREE.js `UnrealBloomPass` (available since r112) before upgrading past 0.149.x; audit all `examples/jsm` imports for API changes.

**`ts-jest: ^29.4.6` vs `jest: ^30.2.0` Version Mismatch:**
- Risk: `jest` is listed at `^30.2.0` but `ts-jest` is at `^29.4.6`. The ts-jest v29 series supports Jest 29 by default; Jest 30 compatibility may require ts-jest v30. These are both in `dependencies` (not `devDependencies`), which is also incorrect — test tooling should not be in production dependencies.
- Files: `package.json` (lines 93–98)
- Impact: Running `npm test` may fail with Jest 30 / ts-jest 29 incompatibilities.
- Migration plan: Move `jest`, `ts-jest`, and `@types/jest` to `devDependencies`; update ts-jest to `^30.x` once a compatible release is available or pin Jest back to `^29.x`.

---

## Missing Critical Features

**No Automated Regression Testing Infrastructure:**
- Problem: No test files exist. `src/tests/` is referenced in the `npm test` script but the directory is absent.
- Blocks: Safe refactoring of core systems (GameState, NWScript, resource parsers, module loading) without manual play-testing of the full game.

**KotOR 2 NWScript Engine Largely Unimplemented:**
- Problem: `src/nwscript/NWScriptDefK2.ts` defines only 24 of the ~800+ K2 script functions.
- Blocks: KotOR 2 gameplay — nearly all K2 module scripts will silently no-op.

---

## Test Coverage Gaps

**Entire Codebase — No Tests:**
- What's not tested: Every subsystem — binary parsing, resource loading, NWScript execution, combat calculations, module loading, save/load, GUI rendering, audio, animation.
- Files: All of `src/` (~90,000 lines)
- Risk: Any change to a core utility class or shared type can break downstream consumers with no automated detection.
- Priority: High

**Highest-Risk Untested Areas (Priority Order):**
1. `src/utility/binary/BinaryReader.ts` — Used by every resource parser; bounds issues are invisible.
2. `src/nwscript/NWScriptStack.ts` — Broken `storeState`/`restoreState` confirmed; no test to catch regressions when fixed.
3. `src/resource/GFFObject.ts` — Primary format for all game data (creatures, doors, items, areas).
4. `src/engine/SaveGame.ts` — Save/load data integrity.
5. `src/module/ModuleCreature.ts` — Combat, AI, stat calculations (4,580 lines, zero error paths).

---

## Other Observations

**`.vs/` IDE Artifacts Not in `.gitignore`:**
- The `.vs/` directory (Visual Studio solution data, `slnx.sqlite`) appears in `git status` as untracked but is not in `.gitignore`. It should be added to prevent accidental commits of local IDE state.
- Files: `.gitignore`, `.vs/` (untracked)

**`wiki` Git Submodule is Empty:**
- The `wiki/` directory contains only a `.git` file (submodule pointer) and no content — the submodule has not been initialized. The `typedoc` script (`package.json` line 19) writes documentation output to `./wiki`, meaning `npm run typedoc` will write into an empty uninitialized submodule directory.
- Files: `.gitmodules`, `wiki/`

**1,217 `console.log/warn/error` Statements in Production Source:**
- Extensive debug logging exists throughout `src/`. Many are in hot paths (per-frame texture loader, Electron IPC handlers). In production builds, these all execute and contribute to I/O overhead.
- Files: Present across nearly all major source files; notable clusters in `src/electron/WindowManager.ts` (IPC handlers) and `src/loaders/TextureLoader.ts`.

---

*Concerns audit: 2026-06-13*
