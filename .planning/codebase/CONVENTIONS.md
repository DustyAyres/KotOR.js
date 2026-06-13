---
last_mapped_commit: 2c3d37c71d954d4e34beaddd0b8eef115aae474e
---

# Coding Conventions

**Analysis Date:** 2026-06-13

## Naming Patterns

**Files:**
- Engine classes: `PascalCase.ts` matching the exported class name exactly (e.g. `ModuleCreature.ts`, `TwoDAManager.ts`)
- React components: `PascalCase.tsx` for top-level components (e.g. `LoadingScreen.tsx`, `App.tsx`); kebab-case subdirectory names (e.g. `cheat-console/cheatConsole.tsx`)
- Enum files: `PascalCase.ts` inside `src/enums/<domain>/` (e.g. `src/enums/engine/GameEngineType.ts`)
- Interface files: `I<Name>.ts` in `src/interface/<domain>/` (e.g. `IGameStateGroups.ts`, `IGUIControlBorder.ts`)
- SCSS files: co-located with the component, same name (e.g. `cheat-console.scss` next to `cheatConsole.tsx`)
- Barrel files: always named `index.ts`

**Classes:**
- Managers: `*Manager` suffix (e.g. `TwoDAManager`, `ConfigManager`, `AppearanceManager`, `ResourceLoader`)
- Module world objects: `Module*` prefix (e.g. `ModuleCreature`, `ModuleDoor`, `ModulePlaceable`)
- Resource parsers/format objects: `*Object` suffix (e.g. `GFFObject`, `ERFObject`, `TwoDAObject`, `TPCObject`)
- GUI controls: `GUI*` prefix (e.g. `GUIControl`, `GUIButton`, `GUIListBox`, `GUIScrollBar`)
- Actions: `Action*` prefix (e.g. `ActionCombat`, `ActionMoveToPoint`)
- Effects: `Effect*` prefix (e.g. `EffectDamage`, `EffectHaste`)
- Events: `Event*` prefix (e.g. `EventApplyEffect`, `EventDestroyObject`)
- State classes (app layer): `*State` suffix (e.g. `ForgeState`, `AppState`, `TabQuickStartState`)
- Factory classes: `*Factory` suffix (e.g. `ActionFactory`, `GameEffectFactory`, `GameEventFactory`)

**Functions/Methods:**
- `camelCase` for instance methods and standalone functions
- `PascalCase` for static methods that act as constructors or major entry points (e.g. `TwoDAManager.Load2DATables()`, `AppState.initApp()`, `ForgeState.InitializeApp()`)
- Utility/helper functions: `camelCase` module-level functions (e.g. `namedGroup()` in `GameState.ts`)

**Variables:**
- Local variables: `camelCase`
- Private static state in Forge app classes: ES2022 `#privateField` syntax (e.g. `ForgeState.#eventListeners`)
- File-scope constants: `SCREAMING_SNAKE_CASE` when representing true constants (e.g. `AVOIDANCE_DISTANCE`, `HOSTED_ORIGIN`, `TAB_AUDIO_VISUAL_IDS`)
- Loop counters and temps: `i`, `j`, `len`, `key`, `_key` (underscore prefix for temporaries)

**Types/Interfaces/Enums:**
- Interfaces: `I<PascalCase>` prefix, exported from `src/interface/` (e.g. `IGameStateGroups`, `IGUIControlColors`)
- Enums: `PascalCase` name, `SCREAMING_SNAKE_CASE` values (e.g. `GameEngineType.KOTOR`, `EngineState.RUNNING`)
- Type aliases: `PascalCase` (e.g. `GFFObjectOnCompleteCallback`, `EditorFileEventListenerTypes`)
- Enum names mirror their file names exactly (file: `GameEngineType.ts` → `export enum GameEngineType`)

## JSDoc Header Convention

Every engine source file (managers, module objects, GUI controls, enums, interfaces, resource parsers) carries a standard JSDoc header block:

```typescript
/**
 * <ClassName> class.               // or enum., or interface.
 * 
 * [Optional description sentence.]
 * 
 * KotOR JS - A remake of the Odyssey Game Engine that powered KotOR I & II
 * 
 * @file <FileName>.ts
 * @author KobaltBlu <https://github.com/KobaltBlu>
 * @license {@link https://www.gnu.org/licenses/gpl-3.0.txt|GPLv3}
 * @memberof KotOR          // present on module-level classes like ModuleCreature
 * @enum                    // present on enum files
 * @interface               // present on interface files
 */
```

Examples confirmed in: `src/enums/engine/GameEngineType.ts`, `src/enums/engine/EngineState.ts`, `src/managers/AppearanceManager.ts`, `src/managers/TwoDAManager.ts`, `src/gui/GUIControl.ts`, `src/module/ModuleCreature.ts`, `src/resource/GFFObject.ts`, `src/actions/Action.ts`, `src/interface/engine/IGameStateGroups.ts`.

The Forge app layer (`src/apps/forge/`) uses richer block comments on complex classes (e.g. `EditorFile.ts` includes `@remarks` and inline `{@link}` references) but the `@file/@author/@license` trio is present throughout.

**Inline comments:**
- Engine layer: explanatory `//` comments on dense logic blocks, sometimes with source attribution URLs
- Heavy use of commented-out code (`// import ...`, `// ipcRenderer.on(...)`) left as development context
- `//TODO` and `//HACK` used without further annotation style rules

## Code Style

**Formatting:**
- No Prettier config detected. No `.prettierrc` or `prettier.config.*` exists in the repository.
- Indentation is 2 spaces throughout engine and app source.
- Brace style: K&R (opening brace on same line), but some constructors omit the space before `{`.
- Single quotes for string literals in most files; double quotes appear in some configuration and error message strings.
- Trailing semicolons used consistently.
- Line endings: LF (enforced by `"newLine": "LF"` in all tsconfig files).

**Linting:**
- Config file: `.eslintrc.yml` at repo root.
- Extends `eslint:recommended` + `plugin:import/recommended` + `plugin:import/typescript`.
- Import resolver configured for TypeScript (`typescript: true`, `node: true`).
- `eslint-plugin-import@^2.32.0` is a devDependency in `package.json`.
- **No `lint` npm script defined in `package.json`.** ESLint is configured but not wired into the npm scripts or any CI step visible in the repo. Linting must be run manually via `npx eslint`.

## TypeScript Configuration

**Engine library** (`tsconfig.json`, used for `src/`):
- `"noImplicitAny": true` — all values must be typed explicitly; `any` is used intentionally and heavily.
- `"strictNullChecks": false` — null/undefined are not type-checked; undefined returns from Map lookups (`Map.get()`) are used without guards throughout.
- `"experimentalDecorators": true` — enabled; however, no decorator usage was found in the current codebase (no `@Injectable`, `@Component`, etc.).
- `"target": "ESNext"`, `"module": "commonjs"` for the engine library (`tsconfig.json`).
- `"module": "esnext"` for Forge app (`tsconfig.forge.json`).
- `"allowJs": true` in base tsconfig (only `main.js` is JS).
- `"skipLibCheck": true` throughout all tsconfigs.
- `"removeComments": true` — comments are stripped in compilation output.

**Path alias:** `@/*` → `src/*` configured in every tsconfig, jest config, and webpack alias. All engine imports use `@/` prefix (e.g. `import { GameState } from "@/GameState"`). Never use relative paths like `../../` when `@/` can be used.

## Import Organization

**Order (observed pattern):**
1. Third-party library imports (`* as THREE from "three"`, `import * as fs from 'fs'`)
2. Engine path-alias imports using `@/` (`from "@/managers/..."`, `from "@/enums/..."`)
3. Type-only imports last within a group using `import type` (662 occurrences across the codebase)

**Example from `ModuleCreature.ts`:**
```typescript
import { GFFObject } from "@/resource/GFFObject";
import * as THREE from "three";
import { ModuleObject } from "@/module/ModuleObject";
import type { ModuleItem } from "@/module/ModuleItem";
import type { ModuleRoom } from "@/module/ModuleRoom";
// ...
import type { Action } from "@/actions/Action";
```

`import type` is used extensively (662 occurrences) to break circular-dependency chains while keeping TypeScript aware of the types.

**Barrel files:** Every domain subdirectory has an `index.ts` re-exporting all public exports (e.g. `src/managers/index.ts`, `src/enums/index.ts`). New engine modules **must** also be re-exported from `src/KotOR.ts` to be reachable from the app layers.

**No default exports** in the engine library. The 20 `export default` occurrences are all inside `src/apps/` React components. Named exports (`export class`, `export function`, `export enum`, `export interface`, `export const`) are used exclusively in the engine (1710 named exports total).

## Static/Singleton Architecture

All engine managers are implemented as **pure static classes** — no instantiation, all members are `static`:

```typescript
// src/managers/TwoDAManager.ts
export class TwoDAManager {
  static datatables: Map<string, TwoDAObject> = new Map();
  static async Load2DATables() { ... }
}
```

Managers are **registered on `GameState`** as static typed references:

```typescript
// src/GameState.ts
export class GameState implements EngineContext {
  static AppearanceManager: typeof AppearanceManager;
  static TwoDAManager: typeof TwoDAManager;
  static ActionFactory: typeof ActionFactory;
  // ...
}
```

**Factory pattern:** Use `ActionFactory`, `GameEffectFactory`, and `GameEventFactory` instead of `new ActionCombat()` etc. directly. Factories hold static references to all concrete classes and instantiate them by type enum. The same pattern applies to `GUIControlFactory` and `GUIControlEventFactory` in `src/gui/`.

**App-layer state classes** (`src/apps/*/states/`) follow a hybrid: static properties for global state, instance methods for event listener management (e.g. `ForgeState` uses `static #eventListeners` and `static addEventListener()`).

## Error Handling

**Pattern:** `try/catch` is the primary error handling mechanism throughout (187 `try {` blocks). Errors are **not propagated** to callers — they are consumed and logged:

```typescript
// Typical engine pattern (src/managers/ConfigManager.ts)
try {
  _settings = JSON.parse(fs.readFileSync(json_path, 'utf-8'));
} catch(e) { console.error('ConfigManager', e); }
```

**Logging:** `console.error`, `console.warn`, and `console.log` are used directly (1458 occurrences). No logging abstraction layer exists. Pattern:
- `console.error(e)` — caught exceptions
- `console.warn('ClassName', 'message', e)` — non-fatal issues
- `console.log('ClassName', data)` — debug tracing (many calls are commented out in production paths)

**Async errors:** Async methods use `try/catch` around `await` calls. Unhandled rejections are not systematically guarded; individual callers are responsible.

**Promises:** Both `async/await` and explicit `new Promise((resolve, reject) => { ... })` are used. The explicit Promise constructor appears where callbacks bridge to async (e.g. `EditorFile.readFile()`, texture loading). `Promise.all()` is used for parallel resource loading (e.g. `TwoDAManager.Load2DATables()`).

## Iteration

**Classical `for` loops** are strongly preferred in the engine for performance-critical hot paths (1997 occurrences). Pattern:
```typescript
for(let i = 0, len = items.length; i < len; i++) { ... }
```

**Functional iteration** (`.map`, `.forEach`, `.filter`, `.reduce`) is used in app-layer React code and one-off data transforms (705 occurrences total). Use `for...of` for typed iterables where appropriate.

## Function Design

**Size:** Many methods are long (hundreds of lines in `ModuleCreature.ts`, `GameState.ts`). No enforced size limit.

**Parameters:** Strongly typed parameter lists. `any` is used when interoperating with legacy data (GFF field values, config options). Optional parameters use `?` suffix or default values.

**Return Values:** `void` for side-effectful methods. Static loader methods return `Promise<void>` or `Promise<T>`. No Result/Either types — errors are thrown or logged.

## Module Design

**Exports:** Named exports only in the engine (`export class`, `export enum`, `export interface`). Default exports confined to React app components.

**Barrel Files:** Every subdirectory has `index.ts`. Importing from `@/managers` (the barrel) is preferred over direct file paths like `@/managers/TwoDAManager`.

**Engine/App boundary:** App layers import the engine exclusively through their local `KotOR.ts` re-export file (e.g. `src/apps/game/KotOR.ts`, `src/apps/forge/KotOR.ts`), which re-exports from `src/KotOR.ts`. Never import from `@/KotOR` directly in app code — use the app-local re-export.

---

*Convention analysis: 2026-06-13*
