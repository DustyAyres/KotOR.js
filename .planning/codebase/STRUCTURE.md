---
last_mapped_commit: 2c3d37c71d954d4e34beaddd0b8eef115aae474e
---

# Codebase Structure

**Analysis Date:** 2026-06-13

## Directory Layout

```
KotOR.js/
├── src/                        # All source code
│   ├── KotOR.ts                # Engine library barrel — re-exports everything
│   ├── GameState.ts            # Central static service locator
│   │
│   ├── actions/                # Action system (ActionFactory + subclasses)
│   ├── audio/                  # AudioEngine, AudioEmitter, AudioLoader, ADPCM
│   ├── combat/                 # CombatRound, CombatData, SpellCastInstance
│   ├── controls/               # IngameControls, Keyboard, Mouse, Gamepad, KeyMapper
│   ├── effects/                # GameEffectFactory + ~50 Effect subclasses
│   ├── engine/                 # Core engine utilities and rule data
│   │   ├── menu/               # ActionMenuManager
│   │   ├── minigames/          # Minigame base logic
│   │   ├── pathfinding/        # BinaryHeap, ComputedPath, PathPoint
│   │   └── rules/              # SWRuleSet + all 2DA-backed rule tables (SW*.ts)
│   ├── enums/                  # All TypeScript enums, grouped by domain
│   │   ├── actions/
│   │   ├── audio/
│   │   ├── combat/
│   │   ├── engine/             # GameEngineType, EngineMode, EngineState, etc.
│   │   ├── effects/
│   │   ├── gui/
│   │   ├── loaders/
│   │   ├── minigames/
│   │   ├── module/
│   │   ├── nwscript/
│   │   ├── odyssey/
│   │   ├── resource/
│   │   └── server/
│   ├── events/                 # GameEventFactory + ~25 Event subclasses
│   ├── game/                   # Game-specific code (K1 vs TSL)
│   │   ├── kotor/              # KotOR 1 menus, gui, minigames; barrel KOTOR.ts
│   │   └── tsl/                # TSL menus, gui, minigames; barrel TSL.ts
│   ├── gui/                    # GUIControl hierarchy, GameMenu base
│   ├── interface/              # TypeScript interfaces (I*.ts), grouped by domain
│   ├── loaders/                # ResourceLoader, TextureLoader, MDLLoader, TemplateLoader
│   ├── managers/               # All static singleton manager classes
│   ├── module/                 # Module, ModuleArea, ModuleObject + all subclasses
│   ├── nwscript/               # NWScript VM, compiler, decompiler
│   │   ├── compiler/
│   │   ├── decompiler/
│   │   └── events/
│   ├── odyssey/                # Binary MDL/MDX parser
│   │   ├── binary/
│   │   ├── controllers/        # OdysseyController + 60+ animation controller subclasses
│   │   └── export/
│   ├── resource/               # Binary format parsers (GFF, ERF, RIM, BIF, KEY, etc.)
│   ├── server/                 # IPC server/debugger bridge
│   │   ├── ipc/
│   │   └── object/
│   ├── shaders/                # Custom GLSL shaders and shader passes
│   │   ├── chunks/
│   │   └── pass/
│   ├── talents/                # TalentObject, TalentFeat, TalentSkill, TalentSpell
│   ├── three/                  # THREE.js integration layer
│   │   └── odyssey/            # OdysseyModel3D, OdysseyObject3D, OdysseyTexture, etc.
│   ├── types/                  # Global TypeScript type declarations
│   ├── utility/                # Cross-cutting utilities
│   │   └── binary/             # BinaryReader, BinaryWriter
│   ├── video/                  # Video playback support
│   ├── worker/                 # Web Workers (bink-worker, server, worker-tex)
│   │
│   ├── electron/               # Electron main-process code
│   │   # index.ts, Main.ts, preload.ts, WindowManager.ts, ApplicationWindow.ts
│   │
│   ├── apps/                   # Four independent React web apps
│   │   ├── common/             # Shared React components (grantAccess, loadingScreen, seo)
│   │   ├── launcher/           # Game launcher app
│   │   │   ├── index.tsx       # App entry point
│   │   │   ├── components/
│   │   │   ├── context/
│   │   │   ├── profiles/
│   │   │   └── styles/
│   │   ├── game/               # In-browser game client app
│   │   │   ├── index.tsx       # App entry point
│   │   │   ├── components/
│   │   │   ├── context/
│   │   │   ├── states/
│   │   │   └── styles/
│   │   ├── forge/              # Modding / resource editor app
│   │   │   ├── index.tsx       # App entry point
│   │   │   ├── components/
│   │   │   │   └── tabs/       # One tab-* subdirectory per file format editor
│   │   │   ├── context/
│   │   │   ├── data/
│   │   │   ├── enum/
│   │   │   ├── helpers/
│   │   │   ├── interfaces/
│   │   │   ├── managers/
│   │   │   ├── module-editor/
│   │   │   ├── states/
│   │   │   └── styles/
│   │   └── debugger/           # NWScript debugger app
│   │       ├── index.tsx       # App entry point
│   │       ├── components/
│   │       ├── context/
│   │       ├── helpers/
│   │       ├── states/
│   │       └── styles/
│   │
│   └── assets/                 # Static assets bundled into apps
│       ├── forge/
│       ├── game/
│       ├── icons/
│       └── launcher/
│
├── webpack/                    # Per-bundle webpack configuration files
│   ├── KotOR.js                # Engine library bundle config (entry: src/KotOR.ts)
│   ├── Launcher.js             # Launcher app bundle config
│   ├── Game.js                 # Game app bundle config
│   ├── Forge.js                # Forge app bundle config
│   ├── Debugger.js             # Debugger app bundle config
│   └── common.js               # Shared helpers (resolve, plugins, esbuild options)
├── webpack.config.js           # Root webpack config — exports array of all 5 configs
│
├── tsconfig.json               # Base TypeScript config (path alias @/* → src/*)
├── tsconfig.kotorjs.json       # Engine library TS config
├── tsconfig.game.json          # Game app TS config
├── tsconfig.forge.json         # Forge app TS config
├── tsconfig.launcher.json      # Launcher app TS config
├── tsconfig.debugger.json      # Debugger app TS config
├── tsconfig.electron.json      # Electron main/preload TS config
│
├── electron-builder.json       # Electron packaging config
├── jest.config.js              # Jest test config
├── package.json                # NPM dependencies and scripts
├── Dockerfile                  # Container build for browser deployment
├── docker/                     # Docker compose / nginx configs
├── scripts/                    # Build/utility scripts
├── wiki/                       # Documentation wiki (git submodule)
├── images/                     # Project screenshots
└── .planning/                  # GSD planning documents
    └── codebase/               # Codebase map documents (ARCHITECTURE.md, STRUCTURE.md, etc.)
```

## Directory Purposes

**`src/GameState.ts`:**
- Purpose: The single most important file — static service locator, THREE scene holder, EngineMode/State controller
- Key methods: `Init()`, `Update()`, `EventOnResize()`, `SetEngineMode()`, `GetDebugState()`

**`src/managers/`:**
- Purpose: All static singleton manager classes; registered onto GameState before engine start
- Key files: `KEYManager.ts`, `BIFManager.ts`, `ERFManager.ts`, `RIMManager.ts`, `TLKManager.ts`, `TwoDAManager.ts`, `MenuManager.ts`, `PartyManager.ts`, `InventoryManager.ts`, `LightManager.ts`, `ModuleObjectManager.ts`, `CutsceneManager.ts`, `index.ts`

**`src/resource/`:**
- Purpose: Binary format parsers only; no game logic, no manager calls
- Key files: `GFFObject.ts`, `GFFStruct.ts`, `GFFField.ts`, `ERFObject.ts`, `RIMObject.ts`, `BIFObject.ts`, `KEYObject.ts`, `TwoDAObject.ts`, `TLKObject.ts`, `TPCObject.ts`, `DLGObject.ts`, `LYTObject.ts`, `VISObject.ts`

**`src/loaders/`:**
- Purpose: Async asset loaders with multi-scope caching; bridge between archive managers and game objects
- Key files: `ResourceLoader.ts`, `TextureLoader.ts`, `MDLLoader.ts`, `TemplateLoader.ts`

**`src/module/`:**
- Purpose: Runtime simulation — Module hierarchy and all ModuleObject subclasses
- Key files: `Module.ts`, `ModuleArea.ts`, `ModuleObject.ts`, `ModuleCreature.ts`, `ModulePlayer.ts`, `ModuleDoor.ts`, `ModulePlaceable.ts`, `ModuleTrigger.ts`, `ModuleItem.ts`

**`src/nwscript/`:**
- Purpose: NWScript VM — bytecode parser, execution engine, action tables, compiler/decompiler
- Key files: `NWScript.ts`, `NWScriptInstance.ts`, `NWScriptStack.ts`, `NWScriptDefK1.ts`, `NWScriptDefK2.ts`, `NWScriptOPCodes.ts`, `NWScriptInstructionSet.ts`, `compiler/`, `decompiler/`

**`src/odyssey/`:**
- Purpose: Pure binary MDL/MDX parsing and animation controller logic; no THREE.js dependency
- Key files: `OdysseyModel.ts`, `OdysseyModelNode.ts`, `OdysseyModelAnimation.ts`, `OdysseyWalkMesh.ts`, `OdysseyModelFactory.ts`, `controllers/OdysseyController.ts`, `controllers/OdysseyControllerFactory.ts`

**`src/three/odyssey/`:**
- Purpose: THREE.js bridge — converts OdysseyModel data into live THREE.Object3D scene objects
- Key files: `OdysseyModel3D.ts`, `OdysseyObject3D.ts`, `OdysseyEmitter3D.ts`, `OdysseyLight3D.ts`, `OdysseyTexture.ts`, `OdysseyMaterialBuilder.ts`, `OdysseyModel3DNodeParser.ts`

**`src/game/kotor/`:**
- Purpose: KotOR 1-specific game menus and screens; barrel at `KOTOR.ts`
- Contains: `menu/` (all K1 ingame and main menus), `gui/` (K1 GFF-based GUI screens), `minigames/`, `swkotor-config.ts`

**`src/game/tsl/`:**
- Purpose: TSL-specific game menus and screens; barrel at `TSL.ts`
- Contains: `menu/` (TSL menus), `gui/`, `minigames/`, `swkotor2-config.ts`

**`src/gui/`:**
- Purpose: Shared GUI control class hierarchy used by both K1 and TSL menus
- Key files: `GUIControl.ts`, `GUIButton.ts`, `GUILabel.ts`, `GUIListBox.ts`, `GameMenu.ts`, `GUIControlFactory.ts`

**`src/engine/`:**
- Purpose: Engine-internal utilities that don't fit a specific subsystem
- Key files: `EngineContext.ts`, `EngineLocation.ts`, `CurrentGame.ts`, `SaveGame.ts`, `FollowerCamera.ts`, `Planetary.ts`, `INIConfig.ts`, `CollisionManager.ts`, `Debugger.ts`, `rules/SWRuleSet.ts`, `pathfinding/ComputedPath.ts`

**`src/enums/`:**
- Purpose: TypeScript const enums and regular enums; organized by domain subfolder
- Key files: `engine/GameEngineType.ts`, `engine/EngineMode.ts`, `engine/EngineState.ts`, `module/ModuleObjectType.ts`, `nwscript/NWScriptDataType.ts`

**`src/interface/`:**
- Purpose: TypeScript interface declarations only (no implementations); mirrors src domain structure
- Naming: All files prefixed `I` (e.g., `IGameContext.ts`, `IModuleScripts.ts`)

**`src/utility/`:**
- Purpose: Stateless utility functions and cross-cutting helpers
- Key files: `GameFileSystem.ts`, `binary/BinaryReader.ts`, `binary/BinaryWriter.ts`, `Utility.ts`, `ApplicationProfile.ts`, `ConfigClient.ts`, `PerformanceMonitor.ts`, `BitWise.ts`, `Dice.ts`

**`src/apps/`:**
- Purpose: Four standalone React 18 apps; each has its own `index.tsx`, `index.html`, webpack config entry, and tsconfig
- Note: Apps do NOT import the engine directly — they reference `@/apps/{app}/KotOR` which is mapped by webpack `externals` to the `KotOR` global

**`src/electron/`:**
- Purpose: Electron main process code only; not bundled with any React app
- Key files: `index.ts` (process entry), `Main.ts` (app lifecycle), `preload.ts` (context bridge), `WindowManager.ts` (window creation/management)

**`src/worker/`:**
- Purpose: Web Worker entry points compiled separately
- Key files: `bink-worker.ts` (Bink video decoder), `server.ts` (debugger IPC server), `worker-tex.ts` (texture decompression)

**`src/shaders/`:**
- Purpose: Custom GLSL shader source and THREE.js ShaderPass wrappers
- Key files: `pass/OdysseyShaderPass.ts`, `ShaderOdysseyModel.ts`, `ShaderAuroraGUI.ts`, `ShaderGrass.ts`, `chunks/`

**`webpack/`:**
- Purpose: One webpack config file per output bundle; shares utilities from `common.js`
- Pattern: Each file exports a factory function `(name, color) => WebpackConfig`

## Key File Locations

**Entry Points:**
- `src/electron/index.ts`: Electron main process start
- `src/electron/preload.ts`: Electron context bridge
- `src/apps/launcher/index.tsx`: Launcher React app root
- `src/apps/game/index.tsx`: Game React app root
- `src/apps/forge/index.tsx`: Forge React app root
- `src/apps/debugger/index.tsx`: Debugger React app root
- `src/KotOR.ts`: Engine library barrel

**Configuration:**
- `tsconfig.json`: Base TS config with `@/*` → `src/*` path alias
- `webpack.config.js`: Webpack multi-bundle root
- `electron-builder.json`: Electron packaging
- `jest.config.js`: Test configuration

**Core Engine:**
- `src/GameState.ts`: Central singleton and scene manager
- `src/managers/index.ts`: Manager barrel
- `src/loaders/ResourceLoader.ts`: Resource cache and resolution
- `src/module/Module.ts`: Game module root
- `src/module/ModuleObject.ts`: Base world object class
- `src/nwscript/NWScript.ts`: Script VM
- `src/odyssey/OdysseyModel.ts`: MDL binary parser
- `src/three/odyssey/OdysseyModel3D.ts`: THREE bridge

**Game-Specific:**
- `src/game/kotor/KOTOR.ts`: KotOR 1 barrel
- `src/game/tsl/TSL.ts`: TSL barrel
- `src/enums/engine/GameEngineType.ts`: K1 vs TSL selector enum
- `src/managers/MenuManager.ts`: Menu registry (holds both K1 and TSL instances)

**Testing:**
- `jest.config.js`: Test runner config (root)
- Tests follow `*.spec.ts` naming; excluded from tsconfig.json `include` by default

## Naming Conventions

**Files:**
- Engine classes: `PascalCase.ts` matching the exported class name (e.g., `ModuleCreature.ts`, `GFFObject.ts`)
- React components: `PascalCase.tsx` (e.g., `GameApp.tsx`, `CategoryMenuItem.tsx`)
- Enums: `PascalCase.ts` in `src/enums/{domain}/` (e.g., `GameEngineType.ts`)
- Interfaces: `I` prefix + `PascalCase.ts` in `src/interface/{domain}/` (e.g., `IModuleScripts.ts`)
- Tab components in Forge: `tab-{resource-type}/` kebab-case directories (e.g., `tab-gff-editor/`, `tab-utc-editor/`)
- Webpack configs: `PascalCase.js` matching bundle name (e.g., `KotOR.js`, `Game.js`)

**Directories:**
- Engine subsystems: `camelCase/` (e.g., `nwscript/`, `odyssey/`, `loaders/`)
- React app sub-directories: `camelCase/` for code directories, `kebab-case/` for component subdirs in Forge
- Game-specific: `src/game/kotor/` and `src/game/tsl/`

**Classes:**
- Managers: `{Domain}Manager` (e.g., `MenuManager`, `TwoDAManager`, `PartyManager`)
- Module objects: `Module{Type}` (e.g., `ModuleCreature`, `ModuleDoor`, `ModulePlaceable`)
- Resource parsers: `{Format}Object` (e.g., `GFFObject`, `ERFObject`, `TwoDAObject`)
- Loaders: `{Asset}Loader` (e.g., `ResourceLoader`, `TextureLoader`, `MDLLoader`)
- Actions: `Action{Verb}` (e.g., `ActionMoveToPoint`, `ActionOpenDoor`, `ActionCombat`)
- Effects: `Effect{Name}` (e.g., `EffectDamage`, `EffectHeal`, `EffectKnockdown`)
- Events: `Event{Name}` (e.g., `EventApplyEffect`, `EventDestroyObject`)
- Odyssey model nodes: `OdysseyModelNode{Type}` (e.g., `OdysseyModelNodeMesh`, `OdysseyModelNodeSkin`)
- THREE bridge objects: `Odyssey{Type}3D` (e.g., `OdysseyModel3D`, `OdysseyObject3D`, `OdysseyEmitter3D`)
- Animation controllers: `{Property}Controller` (e.g., `PositionController`, `AlphaController`)

## Where to Add New Code

**New engine feature (game mechanic, new object type, etc.):**
- New ModuleObject subclass: `src/module/Module{TypeName}.ts` — extend `ModuleObject`
- Register in: `src/module/index.ts` barrel, and in `ModuleArea.ts` object loading logic
- Tests: `src/module/Module{TypeName}.spec.ts`

**New action (NWScript callable behavior):**
- Implementation: `src/actions/Action{Name}.ts` — extend `src/actions/Action.ts`
- Register in: `src/actions/ActionFactory.ts` switch, `src/actions/index.ts`
- Add ActionType: `src/enums/actions/ActionType.ts`

**New effect:**
- Implementation: `src/effects/Effect{Name}.ts` — extend `src/effects/GameEffect.ts`
- Register in: `src/effects/GameEffectFactory.ts`, `src/effects/index.ts`
- Add GameEffectType: `src/enums/effects/GameEffectType.ts`

**New NWScript engine action (K1 or TSL):**
- Add to `src/nwscript/NWScriptDefK1.ts` (K1) or `src/nwscript/NWScriptDefK2.ts` (TSL)
- Map action ID in the class's `actionsMap`

**New manager:**
- Implementation: `src/managers/{Name}Manager.ts` — static class
- Export from: `src/managers/index.ts`
- Register onto: `GameState` static property in `src/GameState.ts`

**New resource format parser:**
- Implementation: `src/resource/{Format}Object.ts`
- Export from: `src/KotOR.ts` barrel if it needs to be part of the public library API

**New utility:**
- Pure functions: `src/utility/{Name}.ts`
- Cross-cutting interface: `src/interface/{domain}/I{Name}.ts`
- New enum: `src/enums/{domain}/{EnumName}.ts`

**New game menu (KotOR 1):**
- Implementation: `src/game/kotor/menu/{MenuName}.ts` — extend `GameMenu`
- Export from: `src/game/kotor/KOTOR.ts`
- Add reference on `MenuManager` static property in `src/managers/MenuManager.ts`

**New game menu (TSL):**
- Implementation: `src/game/tsl/menu/{MenuName}.ts`
- Export from: `src/game/tsl/TSL.ts`
- Add reference on `MenuManager`

**New React component for Forge:**
- Simple component: `src/apps/forge/components/{ComponentName}.tsx`
- New file format tab: `src/apps/forge/components/tabs/tab-{format-name}/`

**New webpack bundle:**
- Config: `webpack/{BundleName}.js` — follow `Game.js` pattern
- Register in: `webpack.config.js` exports array
- tsconfig: `tsconfig.{bundleName}.json` if different TS settings needed

## Special Directories

**`.planning/codebase/`:**
- Purpose: GSD codebase mapping documents (this file and siblings)
- Generated: By `/gsd:map-codebase` commands
- Committed: Yes

**`wiki/`:**
- Purpose: Project documentation wiki (git submodule)
- Generated: No
- Committed: Yes (as submodule reference)

**`dist/`:**
- Purpose: Webpack build output — engine library (`KotOR.js`, `server.js`, `bink-worker.js`) and four app directories (`launcher/`, `game/`, `forge/`, `debugger/`)
- Generated: Yes (by `npm run build` / webpack)
- Committed: No

**`node_modules/`:**
- Purpose: NPM dependencies
- Generated: Yes
- Committed: No

**`docker/`:**
- Purpose: Docker compose and nginx configs for containerized browser deployment
- Generated: No
- Committed: Yes

---

*Structure analysis: 2026-06-13*
