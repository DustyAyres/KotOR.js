---
last_mapped_commit: 2c3d37c71d954d4e34beaddd0b8eef115aae474e
---

# Testing Patterns

**Analysis Date:** 2026-06-13

## CRITICAL: No Working Test Suite

**The test infrastructure is configured but entirely non-functional.** There are zero test files in the repository. The `src/tests/` directory referenced by the npm test script does not exist, and no `*.test.ts` or `*.spec.ts` files are present anywhere under `src/`.

This was confirmed by:
- `Glob('**/*.test.ts', path='src/')` → No files found
- `Glob('**/*.spec.ts', path='src/')` → No files found
- `ls src/tests` → directory does not exist

**Do not write new tests expecting to wire into an existing suite — you must create the suite from scratch.**

## Test Framework (Configured, Not Used)

**Runner:** Jest `^30.2.0`
- Config: `jest.config.js` (repo root)
- Preset: `ts-jest`
- `ts-jest` version: `^29.4.6` (listed as production dependency — misplaced; should be devDependency)
- `@types/jest`: `^30.0.0` (also listed as production dependency — misplaced)

**Test Environment:** `node`

**Transform:**
```js
transform: {
  "^.+.ts?$": ["ts-jest", {}],
}
```

**Module name mapper (path alias support):**
```js
moduleNameMapper: {
  '^@/(.*)$': '<rootDir>/src/$1',
}
```
This means `@/` path aliases work in test files exactly as in source.

**Test discovery pattern:** `**/*.test.ts` (not `.spec.ts` — the tsconfig excludes `*.spec.ts` but the jest config does not include them either)

**Coverage output:** `./coverage/` directory, reporters: `text`, `lcov`, `html`

**Run Commands (as configured):**
```bash
npm test                     # jest --verbose --coverage --no-cache ./src/tests
npx jest --verbose           # Run all discovered *.test.ts files
npx jest --coverage          # With coverage report
npx jest --watch             # Watch mode (not in npm scripts)
```

Note: The npm `test` script (`jest --verbose --coverage --no-cache ./src/tests`) passes a hardcoded path `./src/tests` that does not exist. Running `npm test` will fail immediately. To run any test file, invoke jest directly: `npx jest path/to/file.test.ts`.

## Test File Organization

**Established convention:** None (no test files exist to establish one).

**Recommended placement** based on `jest.config.js` `testMatch: ['**/*.test.ts']` and tsconfig `exclude: ["src/**/*.spec.ts"]`:
- Co-locate test files with source: `src/managers/TwoDAManager.test.ts` alongside `src/managers/TwoDAManager.ts`
- OR use a dedicated directory: `src/tests/<domain>/TwoDAManager.test.ts`

If a `src/tests/` directory is created it will be automatically targeted by the existing npm `test` script.

**Naming:** `<ClassName>.test.ts` — this is the only format Jest is configured to discover.

## Test Structure

**No established pattern exists in this codebase.** Based on the configured framework, use standard Jest patterns:

```typescript
// Example — what a manager test would look like
import { TwoDAManager } from '@/managers/TwoDAManager';

describe('TwoDAManager', () => {
  beforeEach(() => {
    TwoDAManager.datatables = new Map();
  });

  it('should initialize with an empty datatables map', () => {
    expect(TwoDAManager.datatables.size).toBe(0);
  });
});
```

**Static class challenge:** Because all managers are pure static classes, tests must reset static state manually in `beforeEach`/`afterEach`. There is no dependency injection or constructor-based instantiation to swap in test doubles.

## Mocking

**Framework:** Jest built-in (`jest.mock`, `jest.fn`, `jest.spyOn`)

**Key mocking challenges given the architecture:**

Static managers (`GameState`, `TwoDAManager`, `ResourceLoader`, etc.) must be mocked at the module level:
```typescript
jest.mock('@/managers/TwoDAManager', () => ({
  TwoDAManager: {
    datatables: new Map(),
    Load2DATables: jest.fn(),
  }
}));
```

File system access (`GameFileSystem`, `fs` module) must be mocked for unit tests since the engine assumes a real KotOR game installation:
```typescript
jest.mock('fs');
jest.mock('@/utility/GameFileSystem');
```

THREE.js can be mocked via `__mocks__/three.ts` or `jest.mock('three')` — the engine uses THREE heavily for scene graph operations.

**What to mock:**
- `GameFileSystem` — always; tests cannot depend on a real KotOR install
- `ResourceLoader` — for any test not specifically testing resource loading
- `GameState` static references — reset between tests to avoid cross-test pollution
- `fs` module — for any test involving file I/O

**What NOT to mock:**
- Pure data-transform classes: `BinaryReader`, `BinaryWriter`, `GFFObject`, `TwoDAObject` — test these against real binary fixture data
- Enum values — import directly
- Math utilities in `Utility.ts` — test against real inputs

## Fixtures and Factories

**No fixtures or factories exist.** No `__fixtures__`, `__mocks__`, or `factories/` directories are present.

**Recommended approach** when building tests:
- Binary fixture files (`.2da`, `.gff`, `.tpc`) should go in `src/tests/fixtures/`
- Use `fs.readFileSync` to load binary fixtures in tests (the jest environment is `node`)
- Factory helpers for common objects (GFFStruct, GFFField) should go in `src/tests/helpers/`

## Coverage

**Requirements:** None enforced. No coverage threshold is configured in `jest.config.js`.

**Coverage output (when tests exist):**
```bash
npx jest --coverage      # generates ./coverage/ (text + lcov + html)
```

**Current actual coverage: 0%** — no test files exist.

## Test Types

**Unit Tests:** Not present. Would be appropriate for:
- Binary format parsers: `GFFObject`, `TwoDAObject`, `BIFObject`, `ERFObject` in `src/resource/`
- Utility functions: `Utility.ts`, `BitWise.ts`, `BinaryReader.ts`, `BinaryWriter.ts` in `src/utility/`
- Action queue logic: `ActionQueue.ts`, `Action.ts` in `src/actions/`
- NWScript bytecode interpreter: `NWScript.ts`, `NWScriptInstance.ts` in `src/nwscript/`

**Integration Tests:** Not present. Would require mocking `GameFileSystem` to avoid real disk access.

**E2E Tests:** Not applicable. The engine runs in Electron/browser; no E2E framework is configured.

## Async Testing

The engine is async-heavy (1702 async/await/Promise occurrences). All loader and initializer methods return Promises. Jest handles this natively:

```typescript
it('should load a resource', async () => {
  const result = await ResourceLoader.loadResource(ResourceTypes['2da'], 'appearance');
  expect(result).toBeDefined();
});
```

## Error Testing

Engine errors are consumed into `console.error` rather than thrown. Testing error paths requires `jest.spyOn(console, 'error')`:

```typescript
it('should log an error when config file is missing', () => {
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  new ConfigManager('/nonexistent/path.json');
  expect(spy).toHaveBeenCalled();
  spy.mockRestore();
});
```

---

*Testing analysis: 2026-06-13*
