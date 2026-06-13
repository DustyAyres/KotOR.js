---
last_mapped_commit: 2c3d37c71d954d4e34beaddd0b8eef115aae474e
---

<!-- refreshed: 2026-06-13 -->
# Architecture

**Analysis Date:** 2026-06-13

## System Overview

```text
┌────────────────────────────────────────────────────────────────────────────────────┐
│                        Entry Points / Delivery Targets                              │
│  Electron Main          React Web Apps (4)             Library Barrel               │
│  src/electron/index.ts  src/apps/{launcher,game,       src/KotOR.ts                 │
│  src/electron/Main.ts    forge,debugger}/index.tsx     (re-exports whole engine)    │
└────────────────┬───────────────────────────────────────────┬───────────────────────┘
                 │               (runtime global: KotOR)      │
                 ▼                                            ▼
┌────────────────────────────────────────────────────────────────────────────────────┐
│                  GameState  (src/GameState.ts) — Static Service Locator             │
│  THREE scenes/cameras/composer · active Module · all Manager references             │
│  event bus (init/start/ready/beforeRender/afterRender) · EngineMode/EngineState     │
└───────┬───────────────────────────────────────────────────────────────┬────────────┘
        │                                                               │
        ▼                                                               ▼
┌───────────────────────────────────────┐       ┌───────────────────────────────────┐
│  Managers  src/managers/              │       │  Runtime World  src/module/        │
│  KEYManager · BIFManager · ERFManager │       │  Module · ModuleArea               │
│  RIMManager · TLKManager · TwoDA      │       │  ModuleObject (base class)          │
│  MenuManager · PartyManager · Inven   │       │  ModuleCreature · ModulePlayer      │
│  toryManager · LightManager · Cutsc   │       │  ModuleDoor · ModulePlaceable       │
│  eneManager · CutsceneManager · etc.  │       │  ModuleTrigger · ModuleItem · etc.  │
└───────┬───────────────────────────────┘       └───────────────────┬───────────────┘
        │                                                            │
        ▼                                                            ▼
┌──────────────────────────────────────┐       ┌────────────────────────────────────┐
│  Loaders  src/loaders/               │       │  Gameplay Systems                   │
│  ResourceLoader (cache scopes:        │       │  src/actions/  (ActionFactory +     │
│   override/global/module/project)     │       │   ~35 Action subclasses)            │
│  TextureLoader · MDLLoader            │       │  src/effects/  (GameEffectFactory   │
│  TemplateLoader · TGALoader/TPCLoader │       │   + ~50 Effect subclasses)          │
└───────┬──────────────────────────────┘       │  src/events/   (GameEventFactory    │
        │                                       │   + ~25 Event subclasses)           │
        ▼                                       │  src/combat/   (CombatRound etc.)   │
┌──────────────────────────────────────┐       │  src/talents/  (TalentObject etc.)  │
│  Resource Parsers  src/resource/     │       └────────────────────────────────────┘
│  GFFObject · GFFStruct · GFFField    │
│  ERFObject · RIMObject · BIFObject   │       ┌────────────────────────────────────┐
│  KEYObject · TwoDAObject · TLKObject │       │  3D Model Pipeline                  │
│  TPCObject · LIPObject · LYTObject   │       │  src/odyssey/  (binary MDL parser:  │
│  VISObject · DLGObject · SSFObject   │       │   OdysseyModel, OdysseyModelNode,   │
│  BinaryReader/Writer (src/utility/   │       │   OdysseyController, OdysseyWalk    │
│   binary/)                           │       │   Mesh, OdysseyModelFactory)        │
└──────────────────────────────────────┘       │  src/three/odyssey/ (THREE.js       │
                                               │   bridge: OdysseyModel3D,           │
┌──────────────────────────────────────┐       │   OdysseyObject3D, OdysseyEmitter3D,│
│  NWScript VM  src/nwscript/          │       │   OdysseyTexture, OdysseyLight3D)   │
│  NWScript · NWScriptInstance         │       └────────────────────────────────────┘
│  NWScriptStack · NWScriptDef         │
│  NWScriptDefK1 · NWScriptDefK2       │       ┌────────────────────────────────────┐
│  compiler/ · decompiler/             │       │  Rendering  (inside GameState)      │
│  NWScriptOPCodes · NWScriptInstruct  │       │  THREE.WebGLRenderer · EffectComp   │
│  ionSet                              │       │  oser · RenderPass (scene+scene_    │
└──────────────────────────────────────┘       │  gui) · SSAARenderPass · BloomPass  │
                                               │  · BokehPass · OdysseyShaderPass   │
┌──────────────────────────────────────┐       │  · CopyShader (ShaderPass)          │
│  Game-Specific Code  src/game/       │       └────────────────────────────────────┘
│  kotor/ — KOTOR.ts barrel, menus,    │
│   gui, minigames for KotOR 1         │
│  tsl/   — TSL.ts barrel, menus,      │
│   gui, minigames for KotOR 2 TSL     │
│  Selected via GameEngineType enum    │
│  (src/enums/engine/GameEngineType.ts)│
└──────────────────────────────────────┘
```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| GameState | Static service locator; owns THREE scene graph, EffectComposer pipeline, all Manager refs, active Module, EngineMode/State | `src/GameState.ts` |
| KEYManager | Loads chitin.key, bootstraps BIFManager | `src/managers/KEYManager.ts` |
| BIFManager | Indexes BIF archives; accessed by ResourceLoader | `src/managers/BIFManager.ts` |
| ERFManager / RIMManager | Manage ERF and RIM module archives | `src/managers/ERFManager.ts`, `src/managers/RIMManager.ts` |
| TLKManager | Loads talk table (.tlk) for string lookups | `src/managers/TLKManager.ts` |
| TwoDAManager | Caches all 2DA rule tables | `src/managers/TwoDAManager.ts` |
| MenuManager | Holds references to all K1/TSL game menus; dispatches by GameEngineType | `src/managers/MenuManager.ts` |
| PartyManager | Tracks party members and current leader | `src/managers/PartyManager.ts` |
| InventoryManager | Global inventory state | `src/managers/InventoryManager.ts` |
| LightManager | Manages dynamic lights in the THREE scene | `src/managers/LightManager.ts` |
| ModuleObjectManager | Tracks all live ModuleObjects by ID | `src/managers/ModuleObjectManager.ts` |
| CutsceneManager | Controls cutscene playback | `src/managers/CutsceneManager.ts` |
| ResourceLoader | Multi-scope (override/global/module/project) asset cache; resolves resources from BIF/ERF/RIM/override | `src/loaders/ResourceLoader.ts` |
| TextureLoader | Async TPC/TGA texture loading with queue | `src/loaders/TextureLoader.ts` |
| MDLLoader | Loads/caches OdysseyModel from MDL+MDX | `src/loaders/MDLLoader.ts` |
| GFFObject | Parses/serializes BioWare GFF binary format | `src/resource/GFFObject.ts` |
| ERFObject | Parses ERF (Encapsulated Resource Format) archives | `src/resource/ERFObject.ts` |
| RIMObject | Parses RIM module archive files | `src/resource/RIMObject.ts` |
| BIFObject | Parses BIF data archives | `src/resource/BIFObject.ts` |
| KEYObject | Parses chitin.key index | `src/resource/KEYObject.ts` |
| TwoDAObject | Parses 2DA tab-delimited rule tables | `src/resource/TwoDAObject.ts` |
| TLKObject | Parses .tlk localized string table | `src/resource/TLKObject.ts` |
| TPCObject | Parses TPC (DXT-compressed) textures | `src/resource/TPCObject.ts` |
| Module | Top-level game module (IFO) — holds area list, event queue, module-level scripts | `src/module/Module.ts` |
| ModuleArea | Loaded area geometry, creature/object lists, walkmesh, pathfinding, script hooks | `src/module/ModuleArea.ts` |
| ModuleObject | Base class for all in-world objects; ActionQueue, effects list, GFF data, OdysseyModel3D reference | `src/module/ModuleObject.ts` |
| ModuleCreature | NPC creature; combat round, AI, perception | `src/module/ModuleCreature.ts` |
| ModulePlayer | Player character (extends ModuleCreature) | `src/module/ModulePlayer.ts` |
| ModuleDoor | Door objects; open/close state machine | `src/module/ModuleDoor.ts` |
| ModulePlaceable | Placeable objects | `src/module/ModulePlaceable.ts` |
| ModuleTrigger | Area-entry trigger volumes | `src/module/ModuleTrigger.ts` |
| ActionFactory | Constructs Action subclass instances by ActionType enum | `src/actions/ActionFactory.ts` |
| GameEffectFactory | Constructs GameEffect subclass instances | `src/effects/GameEffectFactory.ts` |
| GameEventFactory | Constructs GameEvent subclass instances | `src/events/GameEventFactory.ts` |
| NWScript | Loads, parses, and dispatches .ncs bytecode; selects K1/K2 action table by GameEngineType | `src/nwscript/NWScript.ts` |
| NWScriptInstance | One executing script context; owns NWScriptStack and subroutine chain | `src/nwscript/NWScriptInstance.ts` |
| NWScriptDefK1 | KotOR 1 engine action routine implementations | `src/nwscript/NWScriptDefK1.ts` |
| NWScriptDefK2 | TSL engine action routine implementations | `src/nwscript/NWScriptDefK2.ts` |
| OdysseyModel | Binary MDL/MDX parser; produces node tree, animations, walkmesh | `src/odyssey/OdysseyModel.ts` |
| OdysseyController | Base for all per-node animation controllers (60+ subclasses in `src/odyssey/controllers/`) | `src/odyssey/controllers/OdysseyController.ts` |
| OdysseyModel3D | THREE.js Object3D bridging OdysseyModel to the scene graph | `src/three/odyssey/OdysseyModel3D.ts` |
| OdysseyObject3D | THREE.js wrapper around an individual Odyssey model node mesh | `src/three/odyssey/OdysseyObject3D.ts` |
| GameFileSystem | Filesystem abstraction; dispatches to Node `fs` (Electron) or File System Access API (browser) | `src/utility/GameFileSystem.ts` |
| KOTOR.ts | KotOR 1-specific barrel: all K1 menus, gui, minigames | `src/game/kotor/KOTOR.ts` |
| TSL.ts | TSL-specific barrel: all TSL menus, gui, minigames | `src/game/tsl/TSL.ts` |
| KotOR.ts (library) | Engine library barrel; re-exports entire engine surface | `src/KotOR.ts` |

## Pattern Overview

**Overall:** Static Singleton / Service-Locator Monolith

**Key Characteristics:**
- Every manager and major subsystem is a static class with no constructor instances exposed — all state lives on the class itself
- `GameState` is the central registry: every manager class reference is assigned onto it as a static property before `Init()` is called
- No dependency injection container; direct class imports resolve dependencies
- Circular imports are avoided via TypeScript `import type` (e.g., `ModuleObject` imports `type { ModuleArea }`)
- The engine is compiled as a standalone UMD library (`KotOR` global); React apps receive it via webpack `externals` and never re-bundle it

## Layers

**Resource / IO Layer:**
- Purpose: Binary parsing and filesystem access; no game logic
- Location: `src/resource/`, `src/utility/binary/`, `src/utility/GameFileSystem.ts`
- Contains: Format parsers (GFF, ERF, RIM, BIF, KEY, TwoDA, TLK, TPC, TGA, MDL, LIP, LYT, VIS, DLG, SSF, ZIP), BinaryReader, BinaryWriter
- Depends on: `GameFileSystem`
- Used by: Loaders, Managers

**Archive / Manager Layer:**
- Purpose: Index and cache game data archives; provide named manager APIs to game systems
- Location: `src/managers/`
- Contains: KEYManager, BIFManager, ERFManager, RIMManager, TLKManager, TwoDAManager, and all runtime managers
- Depends on: Resource layer, `src/loaders/ResourceLoader.ts`
- Used by: GameState, Module, all gameplay systems

**Loader Layer:**
- Purpose: Async asset loading with caching (multi-scope: override > module > global > project)
- Location: `src/loaders/`
- Contains: ResourceLoader, TextureLoader, MDLLoader, TemplateLoader, TGALoader, TPCLoader
- Depends on: Resource layer, Managers (KEYManager, BIFManager)
- Used by: Module, ModuleArea, ModuleObject, 3D pipeline

**Runtime World Layer:**
- Purpose: Game world simulation — module hierarchy, object lifecycle, action queues, scripting hooks
- Location: `src/module/`
- Contains: Module, ModuleArea, ModuleObject base, all ModuleObject subclasses (Creature, Player, Door, Placeable, Trigger, Item, Store, Sound, Waypoint, Encounter, Camera, Path, Room, MiniGame, MG* objects)
- Depends on: Loaders, Managers, NWScript VM, Gameplay Systems, 3D pipeline
- Used by: GameState, NWScript actions

**Gameplay Systems Layer:**
- Purpose: Actions, effects, events, combat, talents — the verbs of gameplay
- Location: `src/actions/`, `src/effects/`, `src/events/`, `src/combat/`, `src/talents/`
- Contains: ActionFactory + ~35 Action subclasses; GameEffectFactory + ~50 Effect subclasses; GameEventFactory + ~25 Event subclasses; CombatRound, CombatData; TalentObject/Feat/Skill/Spell
- Depends on: Runtime World layer, NWScript VM, GameState
- Used by: ModuleObject action queue, NWScript action routines

**NWScript VM Layer:**
- Purpose: Execute BioWare NWScript (.ncs) bytecode; bridge script calls to engine action routines
- Location: `src/nwscript/`
- Contains: NWScript, NWScriptInstance, NWScriptStack, NWScriptInstructionSet, NWScriptDef, NWScriptDefK1, NWScriptDefK2, compiler/, decompiler/
- Depends on: GameState, Runtime World, Gameplay Systems
- Used by: Module, ModuleArea, ModuleObject (script hooks)

**3D Model Pipeline:**
- Purpose: Parse Odyssey MDL binary format; build THREE.js scene objects
- Location: `src/odyssey/` (parser), `src/three/odyssey/` (THREE.js bridge)
- Contains: OdysseyModel, OdysseyModelNode hierarchy, OdysseyWalkMesh, OdysseyController subclasses (60+), OdysseyModel3D, OdysseyObject3D, OdysseyEmitter3D, OdysseyLight3D, OdysseyMaterialBuilder, OdysseyTexture
- Depends on: Resource layer (BinaryReader), Loader layer (TextureLoader), THREE.js
- Used by: ModuleObject, ModuleRoom, ModuleArea, Forge model viewer

**Rendering Layer:**
- Purpose: THREE.js WebGL pipeline; post-processing passes
- Location: Owned directly by `src/GameState.ts`
- Contains: THREE.WebGLRenderer, THREE.Scene × 3 (scene, scene_gui, scene_movie), EffectComposer (RenderPass → RenderPassGUI → CopyShader), SSAARenderPass, BloomPass, BokehPass, OdysseyShaderPass (`src/shaders/pass/`), custom GLSL shaders (`src/shaders/`)
- Depends on: THREE.js (externally loaded), OdysseyModel3D
- Used by: GameState main loop

**Game-Specific Layer:**
- Purpose: Per-game (K1 vs TSL) menus, GUI screens, minigames, and config
- Location: `src/game/kotor/`, `src/game/tsl/`
- Contains: All ingame menus (CharGen, InGameOverlay, MainMenu, etc.), GUI sub-screens, minigames (Pazaak, space/swoop racing), swkotor-config.ts / swkotor2-config.ts
- Depends on: Engine core (GUI system `src/gui/`, GameState, Managers)
- Used by: MenuManager (selects which set to instantiate based on GameEngineType)

**GUI System:**
- Purpose: NWN-style GUI control hierarchy loaded from GFF `.gui` files
- Location: `src/gui/`
- Contains: GUIControl base, GUIButton, GUILabel, GUIListBox, GUIProtoItem, GUIScrollBar, GUISlider, GUICheckBox, GUIProgressBar, GUIPanel, GameMenu base, LBL_3DView, LBL_MapView
- Depends on: Resource layer (GFF parser), THREE scene_gui
- Used by: All game menus, Forge GUI editor

**React App Layer:**
- Purpose: Browser/Electron UI shells wrapping the KotOR engine or providing tools
- Location: `src/apps/{launcher,game,forge,debugger}/`
- Contains: Four independent React 18 apps, each with own context, components, states
- Depends on: KotOR global (runtime extern), React, scss
- Used by: Webpack outputs dist/{launcher,game,forge,debugger}/

## Data Flow

### Primary Request Path: Loading a Module

1. User selects game → `GameState.Init()` called (`src/GameState.ts:Init`)
2. `KEYManager.Load(chitin.key)` → parses KEYObject, loads all BIFObjects (`src/managers/KEYManager.ts`)
3. `TwoDAManager.Load2DATables()` → caches all rule tables via ResourceLoader (`src/managers/TwoDAManager.ts`)
4. `MenuManager.Init()` + `MenuManager.LoadMainGameMenus()` → instantiates K1 or TSL menus (`src/managers/MenuManager.ts`)
5. Player triggers module load → `new Module(name)` (`src/module/Module.ts`)
6. Module reads IFO GFF → `ResourceLoader.loadResource('mod', resRef)` → resolves via RIM/ERF cache (`src/loaders/ResourceLoader.ts`)
7. `ModuleArea.load()` → reads ARE+GIT GFFs, creates all ModuleObject instances (`src/module/ModuleArea.ts`)
8. Each ModuleObject calls `MDLLoader.load(resRef)` → returns `OdysseyModel` (`src/loaders/MDLLoader.ts`)
9. `OdysseyModel3D.load(model, context)` builds THREE.js Object3D tree (`src/three/odyssey/OdysseyModel3D.ts`)
10. Object3D added to appropriate `GameState.group.*` THREE.Group → rendered by `EffectComposer` each frame

### NWScript Execution Path

1. ModuleObject script hook fires (e.g., OnHeartbeat) → `NWScript.load(resRef)` (`src/nwscript/NWScript.ts`)
2. NWScript parses .ncs bytecode via BinaryReader → builds instruction map
3. `new NWScriptInstance(nwscript, caller)` — attaches `NWScriptStack`, sets caller context (`src/nwscript/NWScriptInstance.ts`)
4. `instance.run()` → fetch-decode loop over `NWScriptInstructionSet` opcodes
5. `OP_ACTION` opcode → dispatches to `NWScriptDefK1` or `NWScriptDefK2` action table (`src/nwscript/NWScriptDefK1.ts`, `NWScriptDefK2.ts`)
6. Action routine calls engine APIs (e.g., `ActionFactory.fromActionStruct()`, `GameEffectFactory.effect()`)
7. Effects/Actions queued onto `ModuleObject.actionQueue` or applied directly

### Render Loop (per-frame)

1. `GameState.renderer` fires requestAnimationFrame callback
2. `GameState.beforeRender` event fired to listeners
3. `GameState.module.area.update(delta)` ticks all ModuleObjects, processes ActionQueues and event queues
4. Each ModuleObject with an OdysseyModel3D updates animation controllers (`OdysseyController.update()`)
5. `GameState.composer.render()` → RenderPass (scene + camera) → RenderPassGUI (scene_gui + camera_gui) → CopyShader → canvas
6. `GameState.afterRender` event fired

**State Management:**
- All engine state is mutable static properties on `GameState` and Manager classes
- No observable/reactive state in the engine layer; React apps use React Context for UI state only
- `EngineMode` enum (`src/enums/engine/EngineMode.ts`) controls whether GameState ticks world (INGAME) or GUI (GUI/DIALOG/MINIGAME)

## Key Abstractions

**ModuleObject:**
- Purpose: Base class for every interactive entity in a game area (creature, door, placeable, item, trigger, etc.)
- Examples: `src/module/ModuleCreature.ts`, `src/module/ModuleDoor.ts`, `src/module/ModulePlaceable.ts`
- Pattern: Each subclass loads its own GFF template, initializes OdysseyModel3D, has an ActionQueue, and registers with ModuleObjectManager

**OdysseyModel / OdysseyModel3D:**
- Purpose: Two-tier model representation — `OdysseyModel` (binary data) and `OdysseyModel3D` (THREE scene object)
- Examples: `src/odyssey/OdysseyModel.ts`, `src/three/odyssey/OdysseyModel3D.ts`
- Pattern: MDLLoader produces OdysseyModel; OdysseyModel3D.load() converts it into a THREE.Object3D tree with custom ShaderMaterial

**NWScriptDef (K1/K2):**
- Purpose: Maps integer action IDs to engine function implementations; one class per game
- Examples: `src/nwscript/NWScriptDefK1.ts`, `src/nwscript/NWScriptDefK2.ts`
- Pattern: Static class; `NWScript` selects which def to use based on `GameState.GameKey`

**Factory pattern (Actions/Effects/Events):**
- Purpose: Central factory per system creates the correct subclass by enum type
- Examples: `src/actions/ActionFactory.ts`, `src/effects/GameEffectFactory.ts`, `src/events/GameEventFactory.ts`
- Pattern: `static fromType(type: ActionType): Action` — switch over enum, return new subclass

**GFFObject hierarchy:**
- Purpose: All BioWare binary data files (templates, area data, module IFO, etc.) are parsed as GFF
- Examples: `src/resource/GFFObject.ts`, `src/resource/GFFStruct.ts`, `src/resource/GFFField.ts`
- Pattern: `GFFObject.loadFile()` → `BinaryReader` → `GFFStruct` tree with `GFFField` leaves

**ResourceLoader multi-scope cache:**
- Purpose: Prioritized resource resolution: override > module > global > project; module cache cleared on area transition
- Location: `src/loaders/ResourceLoader.ts`
- Pattern: `ResourceLoader.loadResource(resType, resRef)` searches CacheScopes map in priority order

**GameFileSystem:**
- Purpose: Single API for file access that works in both Electron (Node `fs`) and browser (File System Access API)
- Location: `src/utility/GameFileSystem.ts`
- Pattern: `if(ApplicationProfile.ENV == ApplicationEnvironment.ELECTRON)` branches to Node, else uses WICG FileSystemFileHandle

## Entry Points

**Electron Main Process:**
- Location: `src/electron/index.ts` → `src/electron/Main.ts` → `src/electron/WindowManager.ts`
- Triggers: Electron `app.ready` event
- Responsibilities: Creates Tray icon, launches `LauncherWindow` via `WindowManager.createLauncherWindow()`

**Electron Preload:**
- Location: `src/electron/preload.ts`
- Responsibilities: Exposes safe Electron/Node APIs into renderer context (bridges `fs`, IPC)

**Launcher React App:**
- Location: `src/apps/launcher/index.tsx`
- Triggers: DOM `DOMContentLoaded`; rendered into `#root`
- Responsibilities: Game profile selection, grants filesystem access, launches game/forge windows

**Game React App:**
- Location: `src/apps/game/index.tsx`
- Triggers: DOM `DOMContentLoaded`
- Responsibilities: Mounts `<GameApp>` → initializes `KotOR.GameState` → runs game loop; `KotOR` received as runtime global (webpack external `@/apps/game/KotOR → KotOR`)

**Forge React App:**
- Location: `src/apps/forge/index.tsx`
- Triggers: DOM load; reads `?key=kotor|tsl` query param
- Responsibilities: Modding tool UI using KotOR library for resource reading/editing

**Debugger React App:**
- Location: `src/apps/debugger/index.tsx`
- Triggers: DOM load; reads `?uuid=` query param
- Responsibilities: Script debugger UI connected to game process via IPC

**Engine Library Barrel:**
- Location: `src/KotOR.ts`
- Triggers: Imported/required by consuming apps
- Responsibilities: Re-exports entire engine surface; webpack bundles to `dist/KotOR.js` as UMD `KotOR` global

## Architectural Constraints

- **Threading:** Single-threaded main loop per browser window. Web Workers used for: Bink video decoding (`src/worker/bink-worker.ts`), server/IPC channel (`src/worker/server.ts`), texture decompression (`src/worker/worker-tex.ts`).
- **Global state:** All engine state is on static class properties. `GameState`, all `src/managers/*.ts` classes, `ResourceLoader`, `NWScript`, `MDLLoader.ModelCache` — none are instantiated; all are global singletons. This means only one game session can be active per browser window.
- **No DI container:** Dependencies are resolved at import time through direct ES module imports. Swapping implementations requires changing imports.
- **Circular imports:** Mitigated throughout by TypeScript `import type` (type-only imports, erased at runtime). Example: `src/module/ModuleObject.ts` uses `import type { ModuleArea, ModuleDoor }` to break runtime cycles.
- **K1/K2 divergence boundary:** `GameEngineType` enum (`src/enums/engine/GameEngineType.ts`) gates divergent behavior. `MenuManager` holds refs to both KOTOR and TSL menu instances; `NWScript` selects `NWScriptDefK1` or `NWScriptDefK2` at load time.
- **Webpack externals:** Apps declare `three → THREE`, `fs → window.fs`, `@/apps/game/KotOR → KotOR`. THREE.js is served as a separate script tag from `dist/three.min.js`; the engine library is at `dist/KotOR.js`. Apps must not re-bundle these.

## Anti-Patterns

### Direct GameState mutation from deep layers

**What happens:** Resource parsers and loaders occasionally reach up to `GameState.SomeManager` for configuration values instead of receiving them as parameters.
**Why it's wrong:** Creates hidden coupling between the stateless IO layer and the global singleton; makes the loaders untestable in isolation.
**Do this instead:** Pass required context (e.g., game directory, resource type) as method parameters; consult `GameState` only at the manager/module layer (`src/managers/`, `src/module/`).

### Accumulating static state without lifecycle reset

**What happens:** Static Maps and Arrays on managers (e.g., `TwoDAManager.datatables`, `ResourceLoader.CacheScopes`) grow across module loads if not explicitly cleared.
**Why it's wrong:** Stale data from a previous module/game session can leak into the next, causing incorrect behavior that is hard to trace.
**Do this instead:** Call the corresponding `ClearCache` / reinitialize methods (e.g., `ResourceLoader.ClearCache(CacheScope.MODULE)`) at module transition boundaries in `Module.ts` or `ModuleArea.ts`.

## Error Handling

**Strategy:** Async/await with try/catch at loader and manager boundaries; errors logged to console and swallowed to keep the engine running.

**Patterns:**
- Resource loads wrap `await` calls in `try/catch`; missing resources log a console.error and return undefined/null
- NWScriptInstance catches opcode errors per-instruction to prevent one bad script from halting the game loop
- React app entry points use `window.addEventListener('beforeunload', ...)` to clean up Debugger connections (`src/apps/game/index.tsx`)

## Cross-Cutting Concerns

**Logging:** `console.log` / `console.error` throughout; `PerformanceMonitor` (`src/utility/PerformanceMonitor.ts`) wraps named timing sections with `start()`/`stop()`.
**Validation:** Minimal runtime type validation; relies on TypeScript compile-time types. GFF field access uses typed getters on `GFFField`.
**Authentication:** Not applicable — local file access only; browser origin granted via File System Access API picker (FileSystemDirectoryHandle stored in profile).

---

*Architecture analysis: 2026-06-13*
