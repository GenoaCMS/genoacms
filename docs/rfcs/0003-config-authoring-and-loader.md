---
type: rfc
number: 3
title: `@genoacms/config`: authoring API, loader, manifest
status: implemented
commits: [3e1a6b3]
depends: [1]
architecture: [configuration.md]
commit-subject: feat(config): load a config file into a validated manifest
sections: legacy
---

# RFC-0003: `@genoacms/config`: authoring API, loader, manifest

| | |
| :-- | :-- |
| Depends on | RFC-0001 |
| Architecture | §4 D1, D2, D5; §5.5; §6.2; §8; spikes S-2, S-7 |
| Commit | `feat(config): load a config file into a validated manifest` |
| Amended by | RFC-0018 (U12): the directory candidates are `genoa.config/development.*`, not `genoa.config/index.*` (§4.9.1, §5.2 case 2) |

## 1. Summary

Create `packages/config` (TypeScript, compiled with `tsc`, same setup as `language-adapter-ts`) with
two entry points:

- `@genoacms/config`: what a config file imports. `defineConfig`, the per-service provider helpers, `secret()`, `env()`, `inline()`, and the config types.
- `@genoacms/config/load`: `loadConfig()`, which evaluates a config file, loads each adapter's **descriptor** from the project root, applies the loader rules and returns a `Manifest`. It also exports the project-rooted module helpers used by later RFCs.

The host, the Vite plugin and the build helpers are added to this package by RFC-0004 and RFC-0005.

## 2. Files

**Create** (under `packages/config/`):

| File | Purpose |
| :-- | :-- |
| `package.json`, `tsconfig.json`, `README.md` | §4.1, §4.2, §4.12 |
| `src/index.ts` | authoring entry, §4.3 |
| `src/references.ts` | §4.4 |
| `src/providers.ts` | §4.5 |
| `src/config.ts` | §4.6 |
| `src/manifest.ts` | §4.7 |
| `src/errors.ts` | §4.8 |
| `src/load/index.ts` | `loadConfig`, `clearLoadCache`, re-exports; §4.9 |
| `src/load/locate.ts` | `locateConfigFile`; §4.9.1 |
| `src/load/evaluate.ts` | `evaluateConfigModule`; §4.9.2 |
| `src/load/project.ts` | `resolveFromProject`, `importFromProject`, `packageNameOf`, `findPackageJson`; §4.10 |
| `src/load/descriptors.ts` | `loadDescriptors`, `loadDescriptor`; §4.9.3 |
| `src/load/rules.ts` | `checkConfig`, pure; §4.11 |
| `src/load/manifest.ts` | `buildManifest`; §4.9.4 |
| `src/testing/fixtures.ts` | temp-project builder, test-only (excluded from build); §5.1 |
| `src/*.test.ts`, `src/load/*.test.ts` | §5 |
| `test/types/config.test.ts`, `test/types/tsconfig.json` | §5.4 |
| `vitest.config.ts` | `export default defineConfig({ test: { include: ['src/**/*.test.ts'] } })`, so the type-test file is left to `tsc` |

**Modify:** `pnpm-lock.yaml` (via `pnpm install`).

**Delete:** none.

## 3. Non-goals

- No host, no resolution of references to values, no Vite plugin, no build helpers (RFC-0004 and RFC-0005).
- No consumer changes. Core, the CLI and the adapters keep using `@genoacms/cloudabstraction`.
- Do not import any adapter **runtime** module, directly or transitively. The loader reads descriptors only.
- Do not add schema-validation libraries. The rules in §4.11 are hand-written functions returning issues.

## 4. Specification

### 4.1 `package.json`

```json
{
  "name": "@genoacms/config",
  "version": "0.0.1",
  "description": "GenoaCMS configuration: authoring helpers, loader, host and build integration",
  "type": "module",
  "author": { "name": "Filip Holčík", "email": "filip.holcik.official@gmail.com" },
  "license": "ISC",
  "repository": { "type": "git", "url": "git+https://github.com/GenoaCMS/genoacms.git", "directory": "packages/config" },
  "files": ["dist"],
  "exports": {
    ".": { "types": "./dist/index.d.ts", "import": "./dist/index.js" },
    "./load": { "types": "./dist/load/index.d.ts", "import": "./dist/load/index.js" }
  },
  "scripts": {
    "build": "rimraf dist && tsc",
    "prepare": "pnpm run build",
    "test": "pnpm run build && vitest run",
    "check": "tsc --noEmit -p test/types/tsconfig.json"
  },
  "dependencies": {
    "@genoacms/contracts": "workspace:^",
    "@genoacms/internal": "workspace:^",
    "import-meta-resolve": "^4.1.0",
    "vite": "^7.3.1"
  },
  "devDependencies": {
    "@types/node": "^20.8.9",
    "rimraf": "^6.0.1",
    "typescript": "^5.2.2",
    "vitest": "^3.2.7"
  }
}
```

`vite` is a regular dependency with core's exact range, so pnpm resolves one copy. It is imported
only by `src/load/evaluate.ts` here, and by `./vite` and `./build` later. `./host` (RFC-0004) must
never import it.

### 4.2 `tsconfig.json`

Same as `packages/language-adapter-ts/tsconfig.json`, plus `"rootDir": "./src"`, with
`"exclude": ["src/**/*.test.ts", "src/testing/**"]`.

### 4.3 `src/index.ts`

```ts
export { defineConfig } from './config.js'
export { storageProvider, databaseProvider, authenticationProvider, secretsProvider, languageProvider, deploymentTarget } from './providers.js'
export { secret, env, inline, isSecretRef, isEnvRef, isInlineRef, isReference } from './references.js'
export type { Config, SerializedConfig, ProviderEntry, Providers, AuthorizationConfig, SecurityConfig } from './config.js'
export type { Manifest, RuntimeManifest, AdapterRecord } from './manifest.js'
export { toRuntimeManifest } from './manifest.js'
export { ConfigError } from './errors.js'
export type { ConfigIssue } from './errors.js'
export type { Secret, BootstrapSecret, SecretRef, EnvRef, InlineRef, Resolved } from '@genoacms/contracts'
```

### 4.4 `src/references.ts`

```ts
import { assertValidSecretKey } from '@genoacms/contracts/secrets'
import type { SecretRef, EnvRef, InlineRef } from '@genoacms/contracts'

/** A pointer to a value in the configured secret store. The key must follow the portable key rule. */
function secret (key: string): SecretRef {
  assertValidSecretKey(key)
  return { $secret: key }
}

/** A pointer to a process environment variable, read when the provider is constructed. */
function env (variable: string): EnvRef {
  if (variable === '') throw new Error('config/invalid-env-reference: env() needs a variable name')
  return { $env: variable }
}

/** A literal credential that travels with the build. The production build warns once per field. */
function inline<T> (value: T): InlineRef<T> {
  return { $inline: value }
}
```

The guards `isSecretRef`, `isEnvRef` and `isInlineRef` check for a plain object that has exactly one
own key (`$secret`, `$env` or `$inline` respectively). For `$secret` and `$env` the value must also be
a string. `isReference(v)` is true when any of the three is. Objects with extra keys are not
references, so a misspelled helper cannot pass as one.

### 4.5 `src/providers.ts`

```ts
import type { OptionsOf, StorageAdapters, DatabaseAdapters, AuthenticationAdapters, SecretsAdapters, LanguageAdapters, DeploymentTargets } from '@genoacms/contracts'
import type { ProviderEntry } from './config.js'

const entry = <S extends string, O> (adapter: S, options: O): ProviderEntry<S, O> => ({ adapter, options })

function storageProvider<S extends string> (adapter: S, options: OptionsOf<StorageAdapters, S>): ProviderEntry<S, OptionsOf<StorageAdapters, S>> { return entry(adapter, options) }
// databaseProvider → DatabaseAdapters, authenticationProvider → AuthenticationAdapters,
// secretsProvider → SecretsAdapters, languageProvider → LanguageAdapters,
// deploymentTarget → DeploymentTargets. Identical bodies.
```

### 4.6 `src/config.ts`

```ts
import type { CollectionReference } from '@genoacms/contracts/database'
import type { Permission } from '@genoacms/internal/authorization'

interface ProviderEntry<S extends string = string, O = unknown> { readonly adapter: S, readonly options: O }
type Providers = Record<string, ProviderEntry>

interface AuthorizationConfig { /* body and every doc comment copied verbatim from the `authorization`
  stanza of packages/cloudAbstraction/src/config/genoa.config.d.ts, including the stanza's own doc
  comment above the interface. The only change: `permission: Permission` becomes
  `permission: Permission | '*'`, which today's configs already use. */ }

interface SecurityConfig { /* body and every doc comment copied verbatim from the `security` stanza
  of the same file, including the stanza's doc comment. */ }

interface Config<AP extends Providers, DP extends Providers, SP extends Providers,
                 XP extends Providers, LP extends Providers, TP extends Providers> {
  authentication: {
    /** Tried in key order; the first `Identity` wins. */
    providers: AP
    cookieName: string
  }
  database: {
    providers: DP
    databases: Record<string, { provider: keyof DP & string, collections: CollectionReference[] }>
  }
  storage: {
    providers: SP
    buckets: Record<string, { provider: keyof SP & string }>
    defaultBucket: string
    /** Segment separator in storage browser URLs. Default `'|->'`. */
    pathDelimiter?: string
  }
  /** Exactly one provider. A secret store is a single authority; see @genoacms/contracts/secrets. */
  secrets: { providers: XP }
  /** Keyed by the language name a component records. */
  languages: { providers: LP }
  /** Optional: a config used only by the dev server needs no target. A build requires one. */
  deployment?: { targets: TP, default?: keyof TP & string }
  authorization: AuthorizationConfig
  security: SecurityConfig
}

/** Identity function. Exists so provider keys are inferred and cross-references are checked. */
function defineConfig<AP extends Providers, DP extends Providers, SP extends Providers,
  XP extends Providers, LP extends Providers, TP extends Providers> (
  config: Config<AP, DP, SP, XP, LP, TP>): Config<AP, DP, SP, XP, LP, TP> {
  return config
}

/** A loaded config: provider options are plain JSON, references collapsed to their `$…` objects. */
type SerializedConfig = Config<Providers, Providers, Providers, Providers, Providers, Providers>
```

### 4.7 `src/manifest.ts`

```ts
import type { SecretEncoding } from '@genoacms/contracts'
import type { SerializedConfig } from './config.js'

/** What the host needs about one adapter without loading its descriptor again. */
interface AdapterRecord {
  readonly kind: 'storage' | 'database' | 'authentication' | 'secrets' | 'language' | 'deployment'
  /** Bare specifier of the runtime module. Absent for deployment targets. */
  readonly runtime?: string
  readonly secretOptions: Readonly<Record<string, SecretEncoding>>
  readonly developmentOnly: boolean
  /** npm package that owns the descriptor, and its installed version. */
  readonly package: string
  readonly version: string
}

interface Manifest {
  readonly version: 1
  readonly mode: 'development' | 'production'
  readonly config: SerializedConfig
  /** Keyed by descriptor specifier. */
  readonly adapters: Readonly<Record<string, AdapterRecord>>
  /** Development only. `dependencies` includes the config file itself (S-2). */
  readonly source?: { readonly root: string, readonly file: string, readonly dependencies: readonly string[] }
}

/** Embedded in the server bundle: no deployment stanza, no deployment adapters, no watch list. */
interface RuntimeManifest {
  readonly version: 1
  readonly mode: 'development' | 'production'
  readonly config: Omit<SerializedConfig, 'deployment'>
  readonly adapters: Readonly<Record<string, AdapterRecord>>
  readonly source?: { readonly root: string, readonly file: string }
}

function toRuntimeManifest (manifest: Manifest): RuntimeManifest { … }
```

`toRuntimeManifest`:
- copies `version` and `mode`;
- copies `config` without `deployment`;
- copies `adapters` without any record whose `kind === 'deployment'`;
- copies `source` as `{ root, file }` only when `manifest.source` is present.

It returns a new object and never mutates its input.

### 4.8 `src/errors.ts`

```ts
interface ConfigIssue {
  /** Stable identifier, e.g. 'config/bare-secret'. Tests and callers match on it. */
  readonly code: string
  /** Dotted path into the config, e.g. 'storage.providers.gcs.options.credentials'. '' for file-level issues. */
  readonly path: string
  readonly message: string
}

/** Thrown by loadConfig. `issues` lists every problem found, never only the first. */
class ConfigError extends Error {
  readonly code: string
  readonly issues: readonly ConfigIssue[]
  constructor (code: string, issues: readonly ConfigIssue[]) {
    super(`${code}:\n${issues.map(i => `  - ${i.path === '' ? '' : i.path + ': '}${i.message}`).join('\n')}`)
    this.name = 'ConfigError'
    this.code = code
    this.issues = issues
  }
}
```

The message never contains an option *value*. Paths and reference names are allowed.

### 4.9 `src/load/index.ts`

```ts
interface LoadOptions {
  /** Absolute project root. */
  root: string
  /** Absolute config file. Omitted: the default lookup (§4.9.1). */
  file?: string
  mode: 'development' | 'production'
  /** `genoa build --no-inline`: inline() becomes an error in production mode. */
  forbidInline?: boolean
  /** Receives warnings (code 'config/inline'). Default: console.warn with prefix '[genoacms] '. */
  onWarning?: (issue: ConfigIssue) => void
}

declare function loadConfig (options: LoadOptions): Promise<Manifest>
/** Drops memoized manifests. The Vite plugin calls it when a watched file changes. */
declare function clearLoadCache (): void

export { loadConfig, clearLoadCache, locateConfigFile, loadDescriptor, resolveFromProject, importFromProject }
export type { LoadOptions }
```

`loadConfig` flow (one abstraction level; each step is its own function):

```
file      = options.file ?? locateConfigFile(options.root)                  → ConfigError 'config/not-found'
key       = `${file}\0${mode}\0${forbidInline === true}`
memoized  = cache.get(key); if present, return it                            ← promise cached, dropped on reject
evaluated = evaluateConfigModule(file, root)                                 → 'config/evaluation-failed' | 'config/not-an-object'
descriptors = loadDescriptors(evaluated.value, root)                         → collects issues, never throws early
issues    = [...descriptors.issues, ...checkConfig(evaluated.value, descriptors.bySpecifier, mode, forbidInline)]
errors    = issues where code !== 'config/inline';  warnings = the rest
warnings.forEach(onWarning)
if errors.length > 0: throw new ConfigError('config/invalid', errors)
return buildManifest(evaluated, descriptors, mode, root, file)
```

#### 4.9.1 `locateConfigFile(root: string): string`

Checks, in this order, the first file that exists wins:

```
genoa.config.ts
genoa.config.mts
genoa.config.js
genoa.config.mjs
genoa.config/index.ts
genoa.config/index.mts
genoa.config/index.js
genoa.config/index.mjs
```

If none exists, throws `ConfigError('config/not-found', [{ code: 'config/not-found', path: '', message: 'no config file under <root>; looked for: <list>' }])`.

#### 4.9.2 `evaluateConfigModule(file, root)`

```ts
import { runnerImport } from 'vite'

async function evaluateConfigModule (file: string, root: string): Promise<{ value: unknown, dependencies: string[] }> {
  const { module, dependencies } = await runnerImport<{ default?: unknown }>(file, { root, configFile: false, logLevel: 'error' })
  return { value: module.default, dependencies: [file, ...dependencies] }
}
```

- A throw from `runnerImport` becomes `ConfigError('config/evaluation-failed', …)`, with the cause's first line in the message and the original error as `cause`.
- A `value` that is not a plain object (prototype `Object.prototype` or `null`) becomes `ConfigError('config/not-an-object', …)`.
- The file itself goes first in `dependencies`, because `runnerImport` leaves it out (S-2).

#### 4.9.3 `loadDescriptors(config, root)`

It collects every distinct `adapter` string under:
- `authentication.providers.*`,
- `database.providers.*`,
- `storage.providers.*`,
- `secrets.providers.*`,
- `languages.providers.*`,
- `deployment.targets.*`.

For each, it calls `loadDescriptor(specifier, root)`, which returns
`{ descriptor, packageName, version }` or an issue:
- import failure: `config/descriptor-not-found`, with the specifier and the cause's first line;
- default export missing, `kind` not one of the six kinds, or `runtime` not a non-empty string for a non-deployment kind: `config/descriptor-invalid`;
- a deployment descriptor whose `svelteKitAdapter` or `procedure` is not a function: `config/descriptor-invalid`.

`loadDescriptor` must use `importFromProject` (§4.10) and nothing else. **Never** a bare `import()`
(S-7).

#### 4.9.4 `buildManifest`

- `version: 1` and `mode` from the options.
- `config`: the evaluated object, deep-copied with `structuredClone`.
- `adapters`: one `AdapterRecord` per descriptor. `secretOptions` defaults to `{}`, `developmentOnly` to `false`, and `runtime` is omitted for deployment.
- `source` is set only when `mode === 'development'`: `{ root, file, dependencies }`.

### 4.10 `src/load/project.ts`

```ts
import { resolve as resolveEsm } from 'import-meta-resolve'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { join, dirname, basename } from 'node:path'
import { existsSync, readFileSync } from 'node:fs'

/** Resolves a bare specifier as if imported from `<root>/package.json`: Node's ESM algorithm, project-anchored. */
function resolveFromProject (specifier: string, root: string): string {
  return fileURLToPath(resolveEsm(specifier, pathToFileURL(join(root, 'package.json')).href))
}

/** A native import of the project-resolved file. Its own relative and bare imports resolve normally from its package. */
async function importFromProject<T = unknown> (specifier: string, root: string): Promise<T> {
  return await import(pathToFileURL(resolveFromProject(specifier, root)).href) as T
}

/** '@scope/name/sub' → '@scope/name'; 'name/sub' → 'name'. */
function packageNameOf (specifier: string): string { … }

/** Walks up from `file` to the nearest package.json whose "name" equals `packageName`. Throws if none. */
function findPackageJson (file: string, packageName: string): { path: string, version: string } { … }
```

`importFromProject` must not go through Vite's runner. The runner closes after `runnerImport`
returns, and a descriptor's lazy `import()` would then fail (S-7).

### 4.11 `src/load/rules.ts`: `checkConfig(config, descriptors, mode, forbidInline): ConfigIssue[]`

A pure function built from one function per rule. It returns every issue, and its order is stable:
rules in the order below, then config paths in document order.

| # | Code | Rule | Path of the issue |
| :-- | :-- | :-- | :-- |
| 1 | `config/missing-stanza` | `authentication`, `database`, `storage`, `secrets`, `languages`, `authorization` and `security` are present objects. | the stanza name |
| 1b | `config/invalid-provider-entry` | Every value under `*.providers` and `deployment.targets` is a plain object with a non-empty string `adapter` and a plain-object `options`. A malformed entry is skipped by every later rule and by descriptor loading. | the entry's path |
| 2 | `config/not-serializable` | Every value is `null`, a boolean, a finite number, a string, an array, or a plain object. Refused: functions, `undefined` anywhere (including as an object property value), class instances (incl. `Date`, `RegExp`, `Map`), `NaN`, `±Infinity`, `bigint` and symbols. | the offending value |
| 3 | `config/kind-mismatch` | The descriptor's `kind` equals the service it is configured under (`deployment.targets` → `'deployment'`). | `<service>.providers.<key>.adapter` |
| 4 | `config/invalid-options` | Each `validate(options)` string becomes one issue. A `validate` that throws becomes one issue with the thrown message. | `<…>.options` |
| 5 | `config/bare-secret` | Every key in `secretOptions` is either absent from `options` or holds a reference (`isReference`). | `<…>.options.<key>` |
| 6 | `config/misplaced-reference` | A reference appears only as the direct value of a key listed in `secretOptions`. A reference anywhere else, top-level or nested, is an issue. | its path |
| 7 | `config/bootstrap-secret` | No `$secret` reference under `secrets.providers.*.options`. | its path |
| 8 | `config/invalid-secret-key` | Every `$secret` value matches `SECRET_KEY_PATTERN`. | its path |
| 9 | `config/secrets-provider-count` | `secrets.providers` has exactly one key. | `secrets.providers` |
| 10 | `config/unknown-provider` | `storage.buckets.*.provider` ∈ keys of `storage.providers`, `database.databases.*.provider` ∈ keys of `database.providers`, and `deployment.default` ∈ keys of `deployment.targets`. | the referencing path |
| 11 | `config/unknown-bucket` | `storage.defaultBucket` is a key of `storage.buckets`. | `storage.defaultBucket` |
| 12 | `config/integer-key` | No provider, bucket, database or target key matches `/^(0|[1-9][0-9]*)$/`. | the key's path |
| 13 | `config/development-only` | In `production` mode, no provider (any service) uses a descriptor with `developmentOnly: true`. | `<…>.adapter` |
| 14 | `config/inline` (warning) or `config/inline-forbidden` (error, when `forbidInline`) | In `production` mode, one issue per `$inline` reference **outside `deployment.targets`**. Deployment options are used by `genoa deploy` on the operator's machine and never enter the runtime manifest, so an inline credential there is not written into the build. In `development` mode, nothing. | its path |

Rule 2 refuses `undefined` property values because JSON drops them silently, and the manifest must
equal the config. The issue message says `remove the key or give it a value`.

Rules 3 to 7 and 13 skip entries whose descriptor failed to load; that failure is already reported.

### 4.12 `README.md`

At most 60 lines. It should cover:
- the two entry points;
- one complete `genoa.config.ts` example, the minimal one from architecture §8 with `inline()` credentials;
- the table of where `secret()`, `env()` and `inline()` are allowed;
- `loadConfig` usage.

Link to the architecture document.

## 5. Tests

### 5.1 `src/testing/fixtures.ts`

```ts
/**
 * Writes a throwaway project to os.tmpdir(): a config file and fake packages under node_modules.
 * Fake packages are plain ESM files; they never import @genoacms/contracts.
 */
function makeProject (spec: {
  config: string                                   // file content
  configName?: string                              // default 'genoa.config.ts'
  packages?: Record<string, { files: Record<string, string>, exports: Record<string, string>, version?: string }>
  linkConfigPackage?: boolean                      // symlink node_modules/@genoacms/config → this package
}): { root: string, file: string, cleanup: () => void }
```

It also exports these descriptor sources, each a string holding a module's content:
- `storageDescriptor` (`secretOptions: { credentials: 'json' }`, `validate` requiring `projectId`);
- `secretsDescriptor`;
- `devOnlySecretsDescriptor` (`developmentOnly: true`);
- `authDescriptor`;
- `languageDescriptor`;
- `deploymentDescriptor` (with `svelteKitAdapter` and `procedure` functions).

Every fake **runtime** file is `throw new Error('runtime must not be loaded by the loader')`.

### 5.2 `src/load/loader.test.ts`

Each case builds a project with `makeProject`, runs `loadConfig`, and removes the project in `afterEach`.

1. A valid minimal config loads. The manifest has one `AdapterRecord` per distinct specifier, with `package` and `version` taken from the fake package.json. No runtime module was imported, so the throwing runtimes did not fire.
2. `genoa.config/index.ts` is found when `genoa.config.ts` is absent. `genoa.config.ts` wins when both exist.
3. No config file gives `ConfigError` with code `config/not-found`.
4. A config that throws at import gives `config/evaluation-failed`.
5. A config that imports a JSON file `with { type: 'json' }` and a local `.ts` module loads, and in development mode `source.dependencies` contains the config file, the JSON file and the module.
6. In production mode `source` is absent.
7. `import type {} from '<fake adapter>/storage'` in the config does not import that module. Use a descriptor file that throws to prove it.
8. The config imports `secret`, `env` and `inline` from `@genoacms/config` (`linkConfigPackage: true`), and the manifest holds `{ $secret }`, `{ $env }` and `{ $inline }`.
9. One test per rule in §4.11 (15 tests, including 1b). Each asserts that `issues` contains the expected `code` and `path`. Rule 14 asserts that `onWarning` receives the issue in production, that nothing arrives in development, and that `forbidInline` turns it into a `ConfigError`.
10. Several invalid rules in one config are all reported in one `ConfigError`.
11. Two calls with the same file and mode return the same promise. After `clearLoadCache()` a new one is returned.
12. A descriptor missing from `node_modules` gives `config/descriptor-not-found` naming the specifier.

### 5.3 `src/references.test.ts`, `src/manifest.test.ts`

- `secret('a-b')` throws `invalid-secret-key`, and `env('')` throws.
- Each `is*Ref` guard: true for the helper's output, false for an object with an extra key, false for a non-string `$secret`.
- `toRuntimeManifest` drops `deployment`, drops deployment adapter records, drops `source.dependencies`, keeps `source.root`, and does not mutate its input.

### 5.4 Type tests: `test/types/config.test.ts`

Uses `defineConfig`, the provider helpers and registry augmentations declared in the test file
(`declare module '@genoacms/contracts' { interface StorageAdapters { 'a/storage': { projectId: string, credentials?: Secret<{ k: string }> } } interface SecretsAdapters { 'a/secrets': { credentials?: BootstrapSecret<{ k: string }> } } }`).

**Negative** cases, each on a line preceded by `// @ts-expect-error`:
- a bucket's `provider: 'typo'`;
- a bare object in `credentials` of `'a/storage'`;
- `secret('K')` in `credentials` of `'a/secrets'`;
- `deployment.default` naming a missing target.

**Positive** cases:
- an unregistered adapter specifier accepts arbitrary options;
- `inline({ k: 'x' })` in a `Secret` field compiles.

`test/types/tsconfig.json` mirrors RFC-0001 §5.4 and includes this file.

## 6. Steps

1. Create the package and files.
2. `pnpm install`.
3. Implement §4 in the order: errors, references, config, providers, manifest, load/project, load/locate, load/evaluate, load/descriptors, load/rules, load/manifest, load/index.
4. Write the tests in §5, then run §7.

## 7. Verification

```bash
pnpm install
pnpm --filter @genoacms/config run test
pnpm --filter @genoacms/config run check
node -e "import('@genoacms/config/load').then(m => console.log(Object.keys(m).sort().join(',')))" --input-type=module
git status --short
```

**Expected:**
- Tests and check exit 0.
- The `node -e` line, run from `packages/config`, prints `clearLoadCache,importFromProject,loadConfig,loadDescriptor,locateConfigFile,resolveFromProject`.
- `git status` lists only `packages/config/` and `pnpm-lock.yaml`.
- `grep -rn "from 'vite'" packages/config/src --include=*.ts | grep -v test` lists only `src/load/evaluate.ts`.

## 8. Critique

**Pros.** Every rule of architecture §5.5 is a named, individually tested function with a stable
code. The loader cannot load an SDK by construction, and test 1 asserts it. All issues are reported
at once, never only the first.

**Cons & trade-offs.**
- Two resolvers are in play. Vite's `runnerImport` handles the config file and its imports; `import-meta-resolve` handles descriptors. They agree for normal layouts, and they could disagree for custom Vite `resolve.alias` settings, which the loader does not read.
- `runnerImport` is experimental in Vite 7.

**Blindspots.**
- A descriptor with side effects at import time (logging, network) runs them at every load. Nothing enforces that descriptors are side-effect-free beyond the convention and RFC reviews.
- Rule 2 refuses `undefined` property values, while hand-written configs often carry optional keys set to `undefined`. The error message must say "remove the key".
- `findPackageJson` walks up from the resolved file. A descriptor served from a nested `package.json` without a `name` (a pattern some dual-format packages use) is skipped correctly only because the walk compares names.
