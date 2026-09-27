# RFC-0002: `@genoacms/conformance` package

| | |
| :-- | :-- |
| Status | Draft |
| Depends on | RFC-0001 |
| Architecture | §5.1; §10 rows A9, C14 |
| Commit | `feat(conformance): run adapter conformance suites against a constructed instance` |

## 1. Summary

Move the storage and database conformance suites out of `packages/cloudAbstraction/test/` into a new
package, `packages/conformance`. The suites currently read the global config (`config.storage.providers[0]`,
`config.testDocuments`). Instead they take a constructed adapter instance and a fixture as arguments.
The test bodies and assertions are unchanged.

## 2. Files

**Create** (under `packages/conformance/`):

| File | Content |
| :-- | :-- |
| `package.json` | §4.1 |
| `README.md` | §4.4 |
| `src/index.js`, `src/index.d.ts` | §4.2, §4.3 |
| `src/storage.js` | §4.2 |
| `src/database.js` | §4.2 |
| `test/storage.test.js`, `test/database.test.js`, `test/memory.js` | §5 |

**Modify:** `pnpm-lock.yaml` (via `pnpm install` only).

**Delete:** none. `packages/cloudAbstraction/test/*` is deleted in RFC-0016.

## 3. Non-goals

- Do not fix the suites' existing weaknesses. For example, the `getObject` case asserts inside unawaited stream callbacks. Carry them verbatim; a stricter suite is a separate task.
- Do not wire any adapter to these suites. Each adapter RFC does that.

## 4. Specification

### 4.1 `package.json`

```json
{
  "name": "@genoacms/conformance",
  "version": "0.0.1",
  "description": "Conformance suites every GenoaCMS storage and database adapter must pass",
  "type": "module",
  "author": { "name": "Filip Holčík", "email": "filip.holcik.official@gmail.com" },
  "license": "ISC",
  "repository": { "type": "git", "url": "git+https://github.com/GenoaCMS/genoacms.git", "directory": "packages/conformance" },
  "files": ["src"],
  "exports": {
    ".": { "types": "./src/index.d.ts", "import": "./src/index.js" }
  },
  "scripts": { "test": "vitest run" },
  "dependencies": { "@genoacms/contracts": "workspace:^" },
  "peerDependencies": { "vitest": "^3.0.0" },
  "devDependencies": { "vitest": "^3.2.7" }
}
```

### 4.2 Runtime

`src/storage.js` exports:

```js
/**
 * Registers the storage conformance suite with vitest.
 *
 * Call it at the top level of a test file. It takes the instance rather than reading a
 * configuration, so an adapter tests exactly the construction it ships.
 *
 * @param {import('@genoacms/contracts/storage').Adapter} adapter
 * @param {{ bucket: string }} fixture
 */
function runStorageConformance (adapter, { bucket }) { … }
```

The body is `packages/cloudAbstraction/test/storage.test.js` from `suite('complex test', …)` to the
end, with three substitutions:
- `getObject`, `uploadObject`, `deleteObject` and `listDirectory` become `adapter.getObject` and so on;
- `bucket` is the parameter;
- JSDoc type imports point to `@genoacms/contracts/storage`.

The suite name becomes `'storage conformance'`.

`src/database.js` exports:

```js
/**
 * @param {import('@genoacms/contracts/database').Adapter} adapter
 * @param {{
 *   collection: import('@genoacms/contracts/database').CollectionReference,
 *   testDocuments: [import('@genoacms/contracts/database').Document, import('@genoacms/contracts/database').Document]
 * }} fixture
 */
function runDatabaseConformance (adapter, { collection, testDocuments }) { … }
```

The body is `packages/cloudAbstraction/test/database.test.js` from `suite('complex test', …)` to the
end, with the same kind of substitutions:
- adapter methods become `adapter.*`;
- `testCollection` becomes `collection`;
- `config.testDocuments` becomes `testDocuments`.

The suite name becomes `'database conformance'`.

`src/index.js`:

```js
export { runStorageConformance } from './storage.js'
export { runDatabaseConformance } from './database.js'
```

### 4.3 `src/index.d.ts`

```ts
import type { Adapter as StorageAdapter } from '@genoacms/contracts/storage'
import type { Adapter as DatabaseAdapter, CollectionReference, Document } from '@genoacms/contracts/database'

declare function runStorageConformance (adapter: StorageAdapter, fixture: { bucket: string }): void
declare function runDatabaseConformance (
  adapter: DatabaseAdapter,
  fixture: { collection: CollectionReference, testDocuments: [Document, Document] }
): void

export { runStorageConformance, runDatabaseConformance }
```

### 4.4 `README.md`

At most 30 lines. It should cover:
- the two functions;
- that each registers a vitest suite at call time;
- the fixture shapes;
- a usage example constructing an adapter through its runtime's `create` inside a test file, gated by an environment variable for credentials.

## 5. Tests

These tests prove the suites run against a correct adapter. They are not adapter tests.

`test/memory.js` exports two in-memory adapters:
- `memoryStorage()`: a `Map` keyed by `bucket/name`. `listDirectory` returns files whose name starts with the prefix and has no further `/`. `getObject` returns `{ data: Readable.from([Buffer.from(text)]) }`. Sizes are byte lengths, and `lastModified` is the upload time.
- `memoryDatabase()`: a `Map` per collection name. Ids come from `crypto.randomUUID()`.

Each implements the full `Adapter` of its service.

`test/storage.test.js`:

```js
import { runStorageConformance } from '../src/index.js'
import { memoryStorage } from './memory.js'
runStorageConformance(memoryStorage(), { bucket: 'b' })
```

`test/database.test.js` does the same with `memoryDatabase()` and the fixture
`{ collection: { name: 'test', primaryKey: { key: 'id', schema: { type: 'string' } }, schema: { type: 'object' } }, testDocuments: [{ name: 'a' }, { name: 'b' }] }`.

## 6. Steps

1. Create the files in §2.
2. `pnpm install`.
3. Run §7.

## 7. Verification

```bash
pnpm install
pnpm --filter @genoacms/conformance run test
git status --short
```

**Expected:**
- 11 tests pass: 5 storage, 6 database.
- `git status` lists only `packages/conformance/` and `pnpm-lock.yaml`.

## 8. Critique

**Pros.** Adapter conformance no longer needs a config file or the global loader. Two instances of
one adapter could run the suite side by side.

**Cons.** `vitest` is a peer dependency of a published package, a real coupling to one test runner.

**Blindspots.** The in-memory adapters prove that the suites *execute*, not that they are strict.
A suite that asserts too little passes against both a correct and a broken adapter. The unawaited
stream assertion in the storage suite is exactly that case, and it is carried over deliberately (§3).
