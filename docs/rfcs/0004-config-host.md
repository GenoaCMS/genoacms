# RFC-0004: `@genoacms/config/host`: resolution, bootstrap, construction

| | |
| :-- | :-- |
| Status | Implemented (`c8ce612`) |
| Depends on | RFC-0001, RFC-0003 |
| Architecture | §4 D3, D5; §5.6; §6 |
| Commit | `feat(config): construct providers through a host` |

## 1. Summary

Add the host to `@genoacms/config` as the subpath `./host`. The host is the one object per process that:

- holds a (runtime) manifest;
- resolves `secret()`, `env()` and `inline()` references just before construction;
- loads an adapter runtime through an **injected** loader and calls its `create`;
- caches the construction *promise* per provider name, dropping promises that reject.

It also exposes the non-service stanzas as plain reads. The host performs no I/O until a provider
is requested, and it imports neither Vite nor Node's filesystem.

## 2. Files

**Create** (under `packages/config/`):

| File | Purpose |
| :-- | :-- |
| `src/host/index.ts` | `createHost`, `Host`, `HostOptions`; §4.1, §4.2 |
| `src/host/errors.ts` | `HostError`; §4.3 |
| `src/host/resolve.ts` | `resolveOptions`; §4.4 |
| `src/host/secretCache.ts` | `createSecretCache`; §4.5 |
| `src/host/constructions.ts` | `createConstructionCache`; §4.6 |
| `src/host/routing.ts` | pure lookups over the manifest; §4.7 |
| `src/host/*.test.ts` | §5 |

**Modify:** `packages/config/package.json`: add the export
`"./host": { "types": "./dist/host/index.d.ts", "import": "./dist/host/index.js" }`.

**Delete:** none.

## 3. Non-goals

- No TTL, no reload, no reset of individual providers (architecture §6.5).
- No HTTP status mapping. Errors propagate to callers unchanged.
- No imports from `vite`, `node:fs`, `node:path`, `import-meta-resolve` or `src/load/**`. The host ships inside the server bundle. It may import `src/references.ts`, `src/manifest.ts` (types) and `@genoacms/contracts`.
- No caching of secrets that core reads through `host.secrets()` directly. Only resolution of option references is cached.

## 4. Specification

### 4.1 Types

```ts
import type { RuntimeManifest, Manifest } from '../manifest.js'
import type { AdapterRuntime, SecretEncoding, Resolved } from '@genoacms/contracts'
import type { Adapter as StorageAdapter } from '@genoacms/contracts/storage'
import type { Adapter as DatabaseAdapter, CollectionReference } from '@genoacms/contracts/database'
import type { Adapter as AuthenticationAdapter } from '@genoacms/contracts/authentication'
import type { Adapter as SecretsAdapter } from '@genoacms/contracts/secrets'
import type { LanguageAdapter } from '@genoacms/internal/languageAdapter'
import type { AuthorizationConfig, SecurityConfig } from '../config.js'

type RuntimeLoader = (specifier: string) => Promise<{ default: AdapterRuntime<object, unknown> }>

interface HostOptions {
  manifest: RuntimeManifest | Manifest
  /** Injected by the caller: core passes `s => import(/* @vite-ignore *\/ s)`, the CLI passes importFromProject. */
  load: RuntimeLoader
  /** Default: manifest.source?.root. */
  projectRoot?: string
  /** Deadline per getSecret call made while resolving options. Default 10_000. */
  secretTimeoutMs?: number
  /** Default: process.env. */
  environment?: Readonly<Record<string, string | undefined>>
}

interface Host {
  storage (provider: string): Promise<StorageAdapter>
  database (provider: string): Promise<DatabaseAdapter>
  authentication (provider: string): Promise<AuthenticationAdapter>
  language (language: string): Promise<LanguageAdapter>
  secrets (): Promise<SecretsAdapter>

  storageForBucket (bucket: string): Promise<StorageAdapter>
  databaseForCollection (collection: string): Promise<DatabaseAdapter>
  /** Every authentication provider, in config key order. Rejects if any construction fails. */
  authenticationProviders (): Promise<AuthenticationAdapter[]>

  /** Read from the manifest on every access, never copied: authority is re-read (architecture R7). */
  readonly authorization: AuthorizationConfig
  readonly security: SecurityConfig
  readonly cookieName: string
  readonly defaultBucket: string
  /** `storage.pathDelimiter ?? '|->'`. */
  readonly pathDelimiter: string
  /** Bucket names in config key order. */
  readonly buckets: readonly string[]
  /** Database names in config key order. */
  readonly databases: readonly string[]
  /** Every collection of every database, databases in key order, collections in array order. */
  readonly collections: readonly CollectionReference[]

  /** Resolves one options object. Used by `genoa deploy` for target options. */
  resolve<O extends object> (options: O, secretOptions: Readonly<Record<string, SecretEncoding>>, path: string): Promise<Resolved<O>>
  /** Waits for pending constructions, then forgets every constructed provider. CLI only. */
  close (): Promise<void>
}

declare function createHost (options: HostOptions): Host
```

### 4.2 Behavior

`createHost` validates only that `manifest.version === 1`; otherwise it throws
`HostError('host/unsupported-manifest')`. It performs no I/O.

**Construction** of a service provider (`storage`, `database` and `authentication` share one private
function, `construct(service, name, resources)`):

```
construct(service, name):
  return constructions.getOrCreate(`${service}:${name}`, async () => {
    entry   = manifest.config[service].providers[name]      ?? throw HostError('provider/not-found', `${service}.providers.${name}`)
    record  = manifest.adapters[entry.adapter]               ?? throw HostError('provider/unknown-adapter', entry.adapter)
    options = await resolveOptions(entry.options, record.secretOptions, `${service}.providers.${name}.options`, deps)
    runtime = (await load(record.runtime)).default
    return await runtime.create(options, { name, resources: resourcesOf(service, name), projectRoot })
  })
```

- `resourcesOf('storage', n)`: the keys of `storage.buckets` whose `provider === n`.
- `resourcesOf('database', n)`: the keys of `database.databases` whose `provider === n`.
- `resourcesOf('authentication', n)` and the language equivalent: `[]`.

**Secrets** (`host.secrets()`):

```
secrets():
  return constructions.getOrCreate('secrets', async () => {
    names = Object.keys(manifest.config.secrets.providers)
    if names.length !== 1: throw HostError('secrets/provider-count', …)          ← defensive; the loader already refused
    options = await resolveOptions(entry.options, record.secretOptions, path, { …deps, secrets: refuse })
    ... load + create, as above, with resources: []
  })
```

`refuse` is a secrets getter that throws `HostError('config/bootstrap-secret', path)`. A `$secret` in
the store's own options can therefore never recurse.

**Language** (`host.language(language)`): constructs `languages.providers[language]` as above. If the
key is absent, it throws `HostError('language/not-configured', …)`. The message is exactly the
current one from `core/src/lib/script/components/language.server.ts`:

```
No language adapter is configured for '<language>'. Configured languages: <a, b>.
```

When no language is configured, the second sentence is instead
`No language adapters are configured at all.`

After construction, `instance.language !== language` throws `HostError('language/mismatch', …)`
naming both values.

**Routing:**
- `storageForBucket(b)`: `storage.buckets[b]?.provider`, else `HostError('bucket/not-found')`. Then `storage(provider)`.
- `databaseForCollection(c)`: the first database (key order) whose `collections` has an entry with `name === c`, else `HostError('database/not-found')`. Then `database(provider)`.

The codes `bucket/not-found`, `database/not-found` and `provider/not-found` are the strings core
throws today. They are kept so existing error handling keeps matching.

**Reads:** getters over `manifest.config`, as specified in the `Host` doc comments. `authorization`
and `security` are getters returning the manifest's object on each access. They are never
snapshotted in a closure.

**`close()`:** `await Promise.allSettled(all cached promises)`, then clear the construction cache and
the secret cache.

### 4.3 `src/host/errors.ts`

```ts
class HostError extends Error {
  readonly code: string
  constructor (code: string, message: string, options?: { cause?: unknown }) {
    super(`${code}: ${message}`, options)
    this.name = 'HostError'
    this.code = code
  }
}
```

A message may contain config paths, provider names and reference names. **Never a resolved value.**

### 4.4 `src/host/resolve.ts`

```ts
interface ResolveDeps {
  secrets: () => Promise<SecretsAdapter>
  environment: Readonly<Record<string, string | undefined>>
  cache: SecretCache
  timeoutMs: number
}

async function resolveOptions (options: object, secretOptions: Readonly<Record<string, SecretEncoding>>, path: string, deps: ResolveDeps): Promise<object>
```

For each own key `k` of `options`:
- if `k` is **not** in `secretOptions`, copy the value unchanged (the loader already refused misplaced references);
- if `k` **is** in `secretOptions`, resolve by reference kind:

| Value | Result |
| :-- | :-- |
| `isInlineRef(v)` | `v.$inline`, never decoded |
| `isEnvRef(v)` | `environment[v.$env]`; `undefined` → `HostError('secrets/env-missing', '<path>.<k> reads <var>, which is not set')` |
| `isSecretRef(v)` | `cache.get(v.$secret, () => withTimeout(secrets().then(s => s.getSecret(key)), timeoutMs))`; `undefined` → `HostError('secrets/missing', "<path>.<k> points at '<key>', which the configured secret store does not hold. Set it before starting GenoaCMS.")`; timeout → `HostError('provider/secret-unavailable', '<path>.<k> → <key>: no answer within <n> ms')` |
| anything else | `HostError('config/bare-secret', …)` (defensive) |

Every key is resolved concurrently (`Promise.all`), so a provider costs one round trip of latency.

**Decoding:** when `secretOptions[k] === 'json'` and the value came from `$secret` or `$env`, apply
`JSON.parse`. A parse failure becomes `HostError('secrets/invalid-json', '<path>.<k> is declared JSON and is not valid JSON')`,
and the message must **not** include the value or the parser's excerpt of it.

`withTimeout` clears its timer on settle, so a resolved promise leaves no pending timer behind.

### 4.5 `src/host/secretCache.ts`

```ts
interface SecretCache {
  /** One fetch per key per host. Concurrent callers share the promise; a rejected fetch is dropped. */
  get (key: string, fetch: () => Promise<string | undefined>): Promise<string | undefined>
  clear (): void
}
```

`undefined` results **are** cached, since a missing key stays missing for the life of the process.
Rejections are not.

### 4.6 `src/host/constructions.ts`

```ts
interface ConstructionCache {
  /** Returns the cached promise for `key`, or stores and returns `create()`'s. A rejected promise is removed. */
  getOrCreate<T> (key: string, create: () => Promise<T>): Promise<T>
  all (): Array<Promise<unknown>>
  clear (): void
}
```

Removal on rejection must compare identity: `p.catch(() => { if (map.get(key) === p) map.delete(key) })`.
This keeps a late rejection from deleting a newer entry.

### 4.7 `src/host/routing.ts`

Pure functions of `(config, name)`: `bucketProvider`, `databaseOfCollection`, `resourcesOf`,
`collectionsOf`, `bucketNames` and `databaseNames`. No caching, since they are cheap and the manifest
is immutable.

## 5. Tests (`src/host/*.test.ts`, vitest)

All tests use an in-memory manifest and a `load` function over a `Map<string, AdapterRuntime>`.
Runtimes record their `create` calls.

1. **No I/O at creation:** `createHost` calls neither `load` nor any `create`.
2. **Two instances of one adapter:** two storage providers on the same runtime specifier give two `create` calls with their own options and `resources`. `storage('a') !== storage('b')` as instances. `storage('a')` twice gives one `create` call.
3. **Promise caching:** two concurrent `storage('a')` calls before the first resolves give exactly one `create`.
4. **Rejection is not cached:** a `create` that throws once, then succeeds, succeeds on the second call.
5. **References:** `inline` passes through undecoded, even with `json` encoding. `env` reads the injected environment and is JSON-decoded when declared. `secret` reads through `host.secrets()` and is decoded when declared.
6. **Missing values:** `secrets/env-missing`, `secrets/missing`. `secrets/invalid-json`, where the error message does not contain the stored value (assert with a sentinel string).
7. **Timeout:** a `getSecret` that never resolves, with `secretTimeoutMs: 20`, rejects with `provider/secret-unavailable`. A second call retries, because the construction was not cached.
8. **Secret cache:** two providers referencing the same key call `getSecret` once.
9. **Bootstrap:** a `$secret` in the secrets provider's options rejects with `config/bootstrap-secret`, and `getSecret` is never called.
10. **Routing:** `storageForBucket` for a known and an unknown bucket (`bucket/not-found`). `databaseForCollection` finds the first database in key order (`database/not-found` otherwise).
11. **Language:** the unknown-language message exactly as §4.2, for both the one-configured and the none-configured wording. `language/mismatch`.
12. **Reads:** `pathDelimiter` defaults to `'|->'`. `authorization` reflects a mutation of the manifest object made after `createHost` (proves it is not snapshotted). `buckets`, `databases` and `collections` follow key order.
13. **`authenticationProviders()`:** returns instances in key order, and rejects if one construction fails.
14. **`close()`:** after `close`, `storage('a')` calls `create` again.
15. **Import hygiene:** a test reads every `src/host/*.ts` (non-test) file and asserts that none contains `from 'vite'`, `from 'node:fs'`, `from 'node:path'`, `import-meta-resolve` or `'../load/`.

## 6. Steps

1. Implement the files in §2 in the order errors, secretCache, constructions, routing, resolve, index.
2. Add the `./host` export.
3. Write the tests, then run §7.

## 7. Verification

```bash
pnpm --filter @genoacms/config run test
pnpm --filter @genoacms/config run check
git status --short
```

**Expected:** both exit 0, and `git status` lists only files under `packages/config/`.

## 8. Critique

**Pros.**
- Caching by provider name is the whole "two instances of one adapter" fix, and test 2 pins it.
- Rejected constructions are retried, so a transient secret-store outage at cold start does not wedge an instance.

**Cons & trade-offs.**
- `host.secrets()` builds the store with a separate code path from other services, to guarantee the bootstrap rule. It is a second path to keep in sync.
- Cached `undefined` secrets mean a key created after first use is seen only after a restart. That is consistent with the process-lifetime rotation model.

**Blindspots.**
- `authenticationProviders()` rejects when one provider fails to construct. Today a failing adapter import rejects in the same way. But a *transient* secret failure now takes down login for every provider, not only the affected one. Changing that would be a behavior change, so it is left as is and flagged.
- The injected `load` is trusted to return a module whose default export has `create`. A misbuilt runtime fails with a TypeError at first use, not with a host error code.
