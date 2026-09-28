# RFC-0006: Port `@genoacms/adapter-secrets-env`

| | |
| :-- | :-- |
| Status | Implemented (`0b9ddcc`) |
| Depends on | RFC-0001 |
| Architecture | §6.6; U11; R6 |
| Commit | `feat(adapter-secrets-env): add descriptor and instance-scoped runtime` |

## 1. Summary

Add a descriptor (`developmentOnly: true`) and a runtime factory next to the existing module-level
adapter. The runtime:
- resolves its file against `ctx.projectRoot` (default `.genoacms/secrets.env`);
- keeps its own writes in an instance overlay instead of writing `process.env`;
- keeps today's cross-process lock and the `.env` syntax handling (`envFile.js`, unchanged).

`package.json` `exports` are **not** changed here (see the RFC index). RFC-0014 flips them and
deletes `src/index.js`.

## 2. Files

**Create:**

| File | Purpose |
| :-- | :-- |
| `packages/adapter-secrets-env/src/descriptor.js` | §4.1 |
| `packages/adapter-secrets-env/src/descriptor.d.ts` | §4.2 |
| `packages/adapter-secrets-env/src/runtime.js` | §4.3 |
| `packages/adapter-secrets-env/src/runtime.d.ts` | `declare const runtime: AdapterRuntime<EnvSecretsOptions, SecretsAdapter>; export default runtime` |
| `packages/adapter-secrets-env/src/runtime.test.js` | §5 |
| `packages/adapter-secrets-env/src/descriptor.test.js` | §5 |

**Modify:**
- `packages/adapter-secrets-env/package.json`: add the dependency `"@genoacms/contracts": "workspace:^"`. Keep `@genoacms/cloudabstraction` until RFC-0014.
- `packages/adapter-secrets-env/src/envFile.js` and `src/envFile.test.js`: import `assertValidSecretKey` from `@genoacms/contracts/secrets` instead of `@genoacms/cloudabstraction/secrets`. It is the same function. Nothing else in `envFile.js` changes. Without this, `envFile.js` would break when RFC-0014 removes the old dependency.
- `packages/adapter-secrets-env/README.md`: rewrite the "Configuration" and "Behavior" sections (§4.4). Keep the development-only warning and the `.env` syntax section verbatim.

**Delete:** none.

## 3. Non-goals

- Do not modify `src/index.js`. Change only the import line of `src/envFile.js` (§2).
- Do not touch any `.env` file anywhere. Moving core's store is the author's manual step in RFC-0014 (U11).
- No multi-line value support.

## 4. Specification

### 4.1 `src/descriptor.js`

```js
import { defineSecretsAdapter } from '@genoacms/contracts'

const ALLOWED = new Set(['path'])

/**
 * Secrets in a plaintext file under the project, for development only.
 *
 * `developmentOnly` makes a production build refuse this adapter, so a development config deployed
 * by mistake fails at build time rather than on a read-only serverless filesystem.
 */
export default defineSecretsAdapter({
  runtime: '@genoacms/adapter-secrets-env/runtime',
  developmentOnly: true,
  validate (options) {
    const reasons = []
    for (const key of Object.keys(options ?? {})) {
      if (!ALLOWED.has(key)) reasons.push(`unknown option '${key}'`)
    }
    const { path } = /** @type {{ path?: unknown }} */ (options ?? {})
    if (path !== undefined && (typeof path !== 'string' || path === '')) reasons.push('path must be a non-empty string')
    return reasons
  }
})
```

### 4.2 `src/descriptor.d.ts`

```ts
import type { AdapterDescriptor } from '@genoacms/contracts'

export interface EnvSecretsOptions {
  /** Relative to the project root. Default `.genoacms/secrets.env`, which Vite does not watch. */
  path?: string
}

declare module '@genoacms/contracts' {
  interface SecretsAdapters { '@genoacms/adapter-secrets-env': EnvSecretsOptions }
}

declare const descriptor: AdapterDescriptor<'secrets', EnvSecretsOptions>
export default descriptor
```

### 4.3 `src/runtime.js`

```js
import { readFile, writeFile, unlink, mkdir } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { defineRuntime } from '@genoacms/contracts'
import { assertValidSecretKey } from '@genoacms/contracts/secrets'
import { parseEntries, removeEntry, upsertEntry } from './envFile.js'

const DEFAULT_PATH = '.genoacms/secrets.env'
const FILE_MODE = 0o600
const DIRECTORY_MODE = 0o700
const LOCK_TIMEOUT_MS = 5_000
const LOCK_POLL_MS = 20
const DELETED = Symbol('deleted')

export default defineRuntime({
  create ({ path = DEFAULT_PATH }, ctx) {
    const envPath = resolve(requireProjectRoot(ctx), path)
    return createStore(envPath)
  }
})
```

**`requireProjectRoot(ctx)`** throws when `ctx.projectRoot` is undefined:

```
Error('secrets-env/no-project-root: this adapter is for development only; configure a secret manager for deployment')
```

**`createStore(envPath)`** returns the four contract methods. Private helpers: `readEnvFile`,
`writeEnvFile`, `enqueue`, `acquireLock`, `releaseLock`, and a `Map` named `overlay`.

- `readEnvFile`, `enqueue`, `acquireLock` and `releaseLock`: bodies copied from `src/index.js`, rebound to `envPath` and `${envPath}.lock`.
- `writeEnvFile(content)`: `await mkdir(dirname(envPath), { recursive: true, mode: DIRECTORY_MODE })`, then `writeFile(envPath, content, { encoding: 'utf-8', mode: FILE_MODE })`. This is new: the default path lives in a directory that may not exist yet.
- `acquireLock()` also runs the same `mkdir` before creating the lock file.

**Read precedence** (normative):
1. **overlay**: this instance's own writes. `DELETED` means absent.
2. **`process.env[key]`**.
3. **the file**, read fresh on every call.

**Method semantics** (each starts with `assertValidSecretKey(key)`):

| Method | Behavior |
| :-- | :-- |
| `getSecret(key)` | overlay hit → value, or `undefined` for `DELETED`; else `process.env[key]` if defined; else `parseEntries(await readEnvFile()).get(key)` |
| `setSecret(key, value)` | enqueued: upsert into the file, then `overlay.set(key, value)`. Returns `true`. |
| `deleteSecret(key)` | enqueued: remove from the file; `wasPresent` = file had it, or `process.env[key] !== undefined`, or the overlay held a value. Then `overlay.set(key, DELETED)`. Returns `wasPresent`. |
| `setSecretIfAbsent(key, value)` | enqueued and **under the lock**: re-read the file. Present if the file has it, **or** the overlay holds a value, **or** (no overlay entry and `process.env[key] !== undefined`). If present, return `false`; otherwise upsert, `overlay.set(key, value)` and return `true`. |

The module never assigns to `process.env`.

Why the overlay: today's adapter writes `process.env` so that a write is visible to the next read.
Without an overlay, a variable set in the shell would hide every later write, including a key
rotation (architecture §6.6).

### 4.4 README sections

**Configuration** example:

```ts
secrets: {
  providers: {
    local: secretsProvider('@genoacms/adapter-secrets-env', {})   // path defaults to .genoacms/secrets.env
  }
}
```

**Behavior** covers four points:
- the read precedence in §4.3;
- that writes never touch `process.env`;
- the lock file `<path>.lock`;
- that a production build refuses the adapter (`config/development-only`), and that it throws without a project root.

## 5. Tests

`src/descriptor.test.js`:
- `kind === 'secrets'`, `developmentOnly === true`, `runtime === '@genoacms/adapter-secrets-env/runtime'`.
- `validate({})` gives `[]`. `validate({ path: '' })` and `validate({ foo: 1 })` each give one reason.

`src/runtime.test.js` (each case uses a fresh `mkdtemp` project root and cleans up):
1. `create({}, { name: 'l', resources: [] })` without `projectRoot` throws `secrets-env/no-project-root`.
2. The default path is `<root>/.genoacms/secrets.env`. The directory is created on first write. The file mode is `0o600` (check `stat.mode & 0o777`).
3. `setSecret` then `getSecret` returns the value, and `process.env[key]` stays `undefined`.
4. **Overlay beats the environment:** `vi.stubEnv('K', 'shell')`, `setSecret('K', 'new')`, then `getSecret('K') === 'new'`.
5. The environment beats the file when this instance has not written the key.
6. `deleteSecret` of an env-only key returns `true`, and `getSecret` then returns `undefined`.
7. **Two instances** on one file: A's write is visible to B through the file when B has no overlay entry and no env entry.
8. `setSecretIfAbsent` racing ten times across two instances yields exactly one `true` (lock path).
9. An invalid key rejects with `invalid-secret-key` in every method.

## 6. Steps

1. Create the files in §2, update `package.json` and `envFile.test.js`.
2. `pnpm install`.
3. Rewrite the README sections.
4. Run §7.

## 7. Verification

```bash
pnpm install
pnpm --filter @genoacms/adapter-secrets-env run test
git status --short
```

**Expected:**
- All tests pass: the existing `envFile` tests plus the new ones.
- `git status` lists only files under `packages/adapter-secrets-env/` and `pnpm-lock.yaml`.
- `grep -n "process.env\[.*\] =" packages/adapter-secrets-env/src/runtime.js` prints nothing.

## 8. Critique

**Pros.** Instance-scoped: two stores in one process (tests) no longer share a global. The default
path ends the Vite restart problem at its cause, removing the need for `envDir: false`.

**Cons & trade-offs.**
- The file is re-read on every miss, as today. That is fine for development.
- `mkdir` on every write is cheap but redundant after the first.

**Blindspots.** A write made by another process to a key this instance has already written is
invisible to this instance, because the overlay wins. Today the same happens through `process.env`,
so behavior is unchanged. Cross-process writers of the same key are rare in development.
