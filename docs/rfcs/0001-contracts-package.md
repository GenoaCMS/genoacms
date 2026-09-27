# RFC-0001: `@genoacms/contracts` package

| | |
| :-- | :-- |
| Status | Draft |
| Depends on | — |
| Architecture | §4 D2, D5; §5.1; §5.3; §5.4 |
| Commit | `feat(contracts): add the adapter contract package` |

## 1. Summary

Create `packages/contracts`, the only package an adapter depends on. It contains:

- the service contracts, moved from `@genoacms/cloudabstraction` with their method signatures unchanged;
- the secret reference types and `Resolved<O>`;
- the adapter descriptor and runtime types, and the `define*` helpers;
- the provider registry interfaces;
- the collection schema helpers.

Nothing consumes the package yet. `@genoacms/cloudabstraction` stays untouched until RFC-0016.

## 2. Files

**Create** (all under `packages/contracts/`):

| File | Content |
| :-- | :-- |
| `package.json` | §4.1 |
| `README.md` | §4.9 |
| `src/index.js`, `src/index.d.ts` | §4.2, §4.3 |
| `src/references.d.ts` | §4.4 |
| `src/adapter.d.ts` | §4.5 |
| `src/registry.d.ts` | §4.6 |
| `src/storage/index.js`, `src/storage/types.d.ts`, `src/storage/adapter.d.ts` | copy verbatim from `packages/cloudAbstraction/src/services/storage/` |
| `src/storage/index.d.ts` | §4.7 |
| `src/database/index.js` | `export {}` plus the doc comment in §4.7 |
| `src/database/types.d.ts`, `src/database/adapter.d.ts` | copy verbatim from `packages/cloudAbstraction/src/services/database/` |
| `src/database/index.d.ts` | §4.7 |
| `src/authentication/index.js` | `export {}` plus the doc comment in §4.7 |
| `src/authentication/types.d.ts` | copy verbatim from `packages/cloudAbstraction/src/services/authentication/types.d.ts` |
| `src/authentication/adapter.d.ts`, `src/authentication/index.d.ts` | §4.7 |
| `src/secrets/index.js`, `src/secrets/index.d.ts`, `src/secrets/adapter.d.ts` | §4.7 |
| `src/schemas.js` | copy verbatim from `packages/cloudAbstraction/src/config/schemas.js` |
| `src/schemas.d.ts` | §4.8 |
| `test/define.test.js` | §5.1 |
| `test/storage.test.js` | §5.2 |
| `test/secrets.test.js` | §5.3 |
| `test/types/contracts.test.ts`, `test/types/tsconfig.json` | §5.4 |

**Modify:** `pnpm-lock.yaml` (via `pnpm install` only).

**Delete:** none.

## 3. Non-goals

- Do not change `@genoacms/cloudabstraction` or any of its importers.
- Do not move `LanguageAdapter` out of `@genoacms/internal` (architecture §5.1).
- Do not add `secret()`, `env()` or `inline()` here. They are authoring helpers and live in `@genoacms/config` (RFC-0003). This package only has their types.
- Do not add a `./deployment` subpath. Deployment types live in the root export.

## 4. Specification

### 4.1 `package.json`

```json
{
  "name": "@genoacms/contracts",
  "version": "0.0.1",
  "description": "Service contracts, adapter descriptors and secret reference types for GenoaCMS adapters",
  "type": "module",
  "author": { "name": "Filip Holčík", "email": "filip.holcik.official@gmail.com" },
  "license": "ISC",
  "repository": { "type": "git", "url": "git+https://github.com/GenoaCMS/genoacms.git", "directory": "packages/contracts" },
  "files": ["src"],
  "exports": {
    ".": { "types": "./src/index.d.ts", "import": "./src/index.js" },
    "./storage": { "types": "./src/storage/index.d.ts", "import": "./src/storage/index.js" },
    "./database": { "types": "./src/database/index.d.ts", "import": "./src/database/index.js" },
    "./authentication": { "types": "./src/authentication/index.d.ts", "import": "./src/authentication/index.js" },
    "./secrets": { "types": "./src/secrets/index.d.ts", "import": "./src/secrets/index.js" },
    "./schemas": { "types": "./src/schemas.d.ts", "import": "./src/schemas.js" }
  },
  "scripts": {
    "test": "vitest run",
    "check": "tsc -p test/types/tsconfig.json"
  },
  "dependencies": {
    "@genoacms/internal": "workspace:^"
  },
  "devDependencies": {
    "ajv": "^8.12.0",
    "typescript": "^5.2.2",
    "vitest": "^3.2.7"
  }
}
```

`ajv` is a dev dependency only because `database/types.d.ts` imports `JSONSchemaType` from it, as it
does today. It is not a runtime dependency.

### 4.2 `src/index.js`

```js
/**
 * Stamps the service kind onto an adapter descriptor.
 *
 * The kind is what lets the loader refuse a database adapter configured as storage with both names
 * in the message, rather than failing later on a missing method.
 *
 * @param {string} kind
 */
const stamp = (kind) => (descriptor) => Object.freeze({ ...descriptor, kind })

const defineStorageAdapter = stamp('storage')
const defineDatabaseAdapter = stamp('database')
const defineAuthenticationAdapter = stamp('authentication')
const defineSecretsAdapter = stamp('secrets')
const defineLanguageAdapter = stamp('language')
const defineDeploymentTarget = stamp('deployment')

/**
 * Identity functions. They exist for the types: a JavaScript adapter annotates nothing and still
 * gets its `create` checked against the service contract.
 */
const defineRuntime = (runtime) => runtime
const defineDeployProcedure = (procedure) => procedure

export {
  defineStorageAdapter,
  defineDatabaseAdapter,
  defineAuthenticationAdapter,
  defineSecretsAdapter,
  defineLanguageAdapter,
  defineDeploymentTarget,
  defineRuntime,
  defineDeployProcedure
}
```

### 4.3 `src/index.d.ts`

```ts
import type { AdapterDescriptor, AdapterRuntime, DeploymentDescriptor, DeployProcedure } from './adapter.js'
import type { ContainsSecretRef } from './references.js'
import type { Adapter as StorageAdapter } from './storage/index.js'
import type { Adapter as DatabaseAdapter } from './database/index.js'
import type { Adapter as AuthenticationAdapter } from './authentication/index.js'
import type { Adapter as SecretsAdapter } from './secrets/index.js'
import type { LanguageAdapter } from '@genoacms/internal/languageAdapter'

/** Makes a secrets adapter whose options accept `secret()` fail to compile: the bootstrap rule. */
type BootstrapGuard<O> = ContainsSecretRef<O> extends true
  ? { readonly 'secrets adapter options may not accept secret()': never }
  : unknown

declare function defineStorageAdapter<O extends object> (d: Omit<AdapterDescriptor<'storage', O>, 'kind'>): AdapterDescriptor<'storage', O>
declare function defineDatabaseAdapter<O extends object> (d: Omit<AdapterDescriptor<'database', O>, 'kind'>): AdapterDescriptor<'database', O>
declare function defineAuthenticationAdapter<O extends object> (d: Omit<AdapterDescriptor<'authentication', O>, 'kind'>): AdapterDescriptor<'authentication', O>
declare function defineSecretsAdapter<O extends object> (d: Omit<AdapterDescriptor<'secrets', O>, 'kind'> & BootstrapGuard<O>): AdapterDescriptor<'secrets', O>
declare function defineLanguageAdapter<O extends object> (d: Omit<AdapterDescriptor<'language', O>, 'kind'>): AdapterDescriptor<'language', O>
declare function defineDeploymentTarget<O extends object> (d: Omit<DeploymentDescriptor<O>, 'kind'>): DeploymentDescriptor<O>

declare function defineRuntime<O extends object, I> (runtime: AdapterRuntime<O, I>): AdapterRuntime<O, I>
declare function defineDeployProcedure<O extends object> (procedure: DeployProcedure<O>): DeployProcedure<O>

export {
  defineStorageAdapter,
  defineDatabaseAdapter,
  defineAuthenticationAdapter,
  defineSecretsAdapter,
  defineLanguageAdapter,
  defineDeploymentTarget,
  defineRuntime,
  defineDeployProcedure
}
export type * from './references.js'
export type * from './adapter.js'
export type * from './registry.js'
export type { StorageAdapter, DatabaseAdapter, AuthenticationAdapter, SecretsAdapter, LanguageAdapter }
```

### 4.4 `src/references.d.ts`

The types exactly as in architecture §5.3, verified with `tsc --strict`. Export: `SecretRef`, `EnvRef`,
`InlineRef`, `Secret`, `BootstrapSecret`, `SecretEncoding`, `ResolvedValue`, `Resolved`,
`ContainsSecretRef`.

```ts
/** A value fetched from the configured secrets provider when a provider is constructed. */
interface SecretRef { readonly $secret: string }
/** A value read from the process environment when a provider is constructed. */
interface EnvRef { readonly $env: string }
/** A literal that travels with the build. Visible by design: a search for `inline(` finds every one. */
interface InlineRef<T> { readonly $inline: T }

/** An option that holds a credential. `T` is the resolved type: `string`, or an object for JSON credentials. */
type Secret<T = string> = SecretRef | EnvRef | InlineRef<T>
/** A credential the secrets provider itself may take. It cannot reference the store it configures. */
type BootstrapSecret<T = string> = EnvRef | InlineRef<T>

/** How a `secret()` or `env()` string becomes the option's value. `inline()` values are never decoded. */
type SecretEncoding = 'string' | 'json'

type ResolvedValue<V> =
  [V] extends [SecretRef | EnvRef | InlineRef<infer T>] ? T :
  V extends ReadonlyArray<infer E> ? Array<ResolvedValue<E>> :
  V extends object ? Resolved<V> : V

/** Options as `create` receives them: every reference replaced by its value. Optional fields stay optional. */
type Resolved<O> = {
  [K in keyof O]: ResolvedValue<NonNullable<O[K]>> | (undefined extends O[K] ? undefined : never)
}

/** True when any field of O, at any depth, accepts a SecretRef. */
type ContainsSecretRef<O> = true extends {
  [K in keyof O]-?: [Extract<NonNullable<O[K]>, SecretRef>] extends [never]
    ? (NonNullable<O[K]> extends object ? ContainsSecretRef<NonNullable<O[K]>> : false)
    : true
}[keyof O] ? true : false

export type { SecretRef, EnvRef, InlineRef, Secret, BootstrapSecret, SecretEncoding, ResolvedValue, Resolved, ContainsSecretRef }
```

### 4.5 `src/adapter.d.ts`

```ts
import type { Resolved, SecretEncoding } from './references.js'

/** SDK-free. The module at the specifier a config entry names. */
interface AdapterDescriptor<Kind extends string, O extends object> {
  readonly kind: Kind
  /** Bare specifier of the runtime module, e.g. '@genoacms/adapter-gcp/storage/runtime'. Never relative. */
  readonly runtime: string
  /** Top-level options that hold references, and how to decode them. A reference anywhere else is refused. */
  readonly secretOptions?: { readonly [K in keyof O]?: SecretEncoding }
  /** Refused by a production build. */
  readonly developmentOnly?: boolean
  /** Checks unresolved options. Returns the reasons they are invalid; an empty array means valid. */
  readonly validate?: (options: unknown) => string[]
}

interface AdapterContext {
  /** The provider's key in the config. For log lines and error messages, never for lookup. */
  readonly name: string
  /** Resources bound to this provider: bucket names for storage, database names for a database, otherwise empty. */
  readonly resources: readonly string[]
  /** Present in the dev server, the CLI and development builds. Absent in a production artifact. */
  readonly projectRoot?: string
}

/** Default export of a runtime module. */
interface AdapterRuntime<O extends object, Instance> {
  readonly create: (options: Resolved<O>, ctx: AdapterContext) => Instance | Promise<Instance>
}

/** A SvelteKit adapter factory, typed structurally so this package needs no dependency on @sveltejs/kit. */
type SvelteKitAdapterFactory = (options?: Record<string, unknown>) => { name: string, adapt: (builder: unknown) => unknown }

/**
 * Both loaders are functions written inside the descriptor module, so each specifier resolves from
 * the adapter package that declares the dependency. Importing a SvelteKit adapter by name from core
 * fails under strict pnpm (architecture S-5).
 */
interface DeploymentDescriptor<O extends object> {
  readonly kind: 'deployment'
  readonly svelteKitAdapter: () => Promise<{ default: SvelteKitAdapterFactory }>
  /** Receives unresolved options: credentials never influence the build. */
  readonly svelteKitOptions?: (options: O, ctx: { outDir: string }) => Record<string, unknown>
  readonly procedure: () => Promise<{ default: DeployProcedure<O> }>
  readonly secretOptions?: { readonly [K in keyof O]?: SecretEncoding }
  readonly validate?: (options: unknown) => string[]
}

interface DeployContext {
  readonly projectRoot: string
  /** Absolute path of the build artifact. */
  readonly buildDir: string
  /** Absolute scratch directory owned by this deploy. It exists and is empty when the procedure starts. */
  readonly workDir: string
  /** The target's key in `deployment.targets`. */
  readonly target: string
}

type DeployProcedure<O extends object> = (options: Resolved<O>, ctx: DeployContext) => Promise<void>

export type { AdapterDescriptor, AdapterContext, AdapterRuntime, SvelteKitAdapterFactory, DeploymentDescriptor, DeployContext, DeployProcedure }
```

### 4.6 `src/registry.d.ts`

```ts
/**
 * Adapter descriptor specifier → option type. Adapters extend these by module augmentation:
 *
 *   declare module '@genoacms/contracts' {
 *     interface StorageAdapters { '@genoacms/adapter-gcp/storage': GcpStorageOptions }
 *   }
 *
 * An unregistered specifier gets `Record<string, unknown>`: it configures, unchecked.
 */
interface StorageAdapters {}
interface DatabaseAdapters {}
interface AuthenticationAdapters {}
interface SecretsAdapters {}
interface LanguageAdapters {}
interface DeploymentTargets {}

type OptionsOf<R, S extends string> = S extends keyof R ? R[S] : Record<string, unknown>

export type { StorageAdapters, DatabaseAdapters, AuthenticationAdapters, SecretsAdapters, LanguageAdapters, DeploymentTargets, OptionsOf }
```

Module augmentation targets the root specifier `@genoacms/contracts`, so `index.d.ts` must
re-export these interfaces with `export type *` (as in §4.3). That makes them augmentable there.

### 4.7 Service subpaths

The rules below apply to every service subpath:

- **Removed:** every `declare module '@genoacms/adapter-*/…'` block, and the `*Provider`, `BucketInit`, `DatabaseInit` and `SecretReference` types. They describe the old config shape.
- **Kept:** every method signature and every doc comment on it.
- **Instance type:** each subpath exports an interface named `Adapter` describing one constructed instance.

`src/storage/index.d.ts`: copy `packages/cloudAbstraction/src/services/storage/index.d.ts`. Delete the
`declare module` block, `StorageProvider` and `BucketInit` (the types and their exports). Keep
`PreconditionFailedError`, `isPreconditionFailed` and all type re-exports.

`src/database/index.d.ts`: copy `packages/cloudAbstraction/src/services/database/index.d.ts`. Delete
the `declare module` block, `DatabaseInit` and `DatabaseProvider`. Keep `Adapter` and every type
re-export from `./types.d.ts`.

`src/database/index.js` and `src/authentication/index.js`:

```js
/**
 * Types only. The file exists so that an import of this subpath resolves at runtime as well as in
 * the type checker; the contract has no runtime values.
 */
export {}
```

`src/authentication/adapter.d.ts`:

```ts
import type { Identity } from './types.d.ts'

export declare namespace Adapter {
  type authenticate = (email: string, password: string) => Promise<Identity | null>
}

/** One constructed authentication provider. */
export interface Adapter {
  authenticate: Adapter.authenticate
}
```

`src/authentication/index.d.ts`:

```ts
import type { Adapter } from './adapter.d.ts'
import type { Identity } from './types.d.ts'

export type { Adapter, Identity }
```

`src/secrets/adapter.d.ts`: copy `packages/cloudAbstraction/src/services/secrets/adapter.d.ts`
verbatim. Then append:

```ts
/** One constructed secrets provider. */
export interface Adapter {
  getSecret: Adapter.getSecret
  setSecret: Adapter.setSecret
  deleteSecret: Adapter.deleteSecret
  setSecretIfAbsent: Adapter.setSecretIfAbsent
}
```

`src/secrets/index.js`: copy `packages/cloudAbstraction/src/services/secrets/index.js` and delete
`isSecretReference` (function, doc comment, export). Keep `SECRET_KEY_PATTERN`, `isValidSecretKey`
and `assertValidSecretKey` with their doc comments.

`src/secrets/index.d.ts`:

```ts
import type { Adapter } from './adapter.d.ts'

/**
 * The portable key rule every adapter enforces: the intersection of what the secret managers
 * accept, so a key valid in development stays valid in production.
 */
declare const SECRET_KEY_PATTERN: RegExp
declare function isValidSecretKey (key: string): boolean
declare function assertValidSecretKey (key: string): void

export { SECRET_KEY_PATTERN, isValidSecretKey, assertValidSecretKey }
export type { Adapter }
```

Keep the doc comment on "exactly one provider" that currently sits on `SecretProvider`: move it
verbatim above `export type { Adapter }` in `secrets/index.d.ts`. It states a property of the service,
and the loader enforces that property now.

### 4.8 `src/schemas.d.ts`

```ts
/** JSON Schema fragments for collection fields. Plain objects: they serialize into the manifest. */
declare const storageResource: Record<string, unknown>
declare const nullableStorageResource: Record<string, unknown>
declare function globalReference (options: { type?: string, format?: string }): Record<string, unknown>
declare function reference (options: { type?: string, format?: string, collection: string }): Record<string, unknown>

export { storageResource, nullableStorageResource, globalReference, reference }
```

### 4.9 `README.md`

At most 40 lines. It should state:
- what the package is: the only dependency an adapter needs;
- the descriptor/runtime split and why the descriptor must import no SDK;
- how to register option types (the augmentation example from §4.6);
- the bootstrap rule enforced by `defineSecretsAdapter`.

Link to `docs/architecture/configuration.md`.

## 5. Tests

### 5.1 `test/define.test.js` (vitest)

- Each of the six `define*Adapter` / `defineDeploymentTarget` returns an object with the expected `kind` and every input property.
- The result is frozen (`Object.isFrozen`).
- A `kind` in the input is overwritten by the stamp.
- `defineRuntime(x) === x` and `defineDeployProcedure(x) === x`.

### 5.2 `test/storage.test.js`

- `new PreconditionFailedError({ bucket: 'b', name: 'n' }, 'r')` has `name === 'PreconditionFailedError'`, and its message is `storage/precondition-failed: b/n: r`.
- `isPreconditionFailed` is true for that error, true for `{ name: 'PreconditionFailedError' }`, and false for `new Error()`, `null` and `'x'`.

### 5.3 `test/secrets.test.js`

- `isValidSecretKey`: `A`, `_a1` and `GENOACMS_ROOT_KEY_SEED` are valid. `1a`, `a-b`, `a.b` and `''` are invalid.
- `assertValidSecretKey('a-b')` throws with a message starting `invalid-secret-key:`.

### 5.4 Type tests: `test/types/contracts.test.ts`

`test/types/tsconfig.json`:

```json
{
  "compilerOptions": { "strict": true, "noEmit": true, "module": "NodeNext", "moduleResolution": "NodeNext", "target": "ES2022", "types": [], "skipLibCheck": true },
  "files": ["contracts.test.ts"]
}
```

`contracts.test.ts` imports from `'@genoacms/contracts'` and asserts the following. A negative case
is a line preceded by `// @ts-expect-error`, so `tsc` fails if that line compiles.

1. `Resolved<{ projectId: string, credentials?: Secret<{ private_key: string }> }>` gives `credentials?.private_key` the type `string | undefined`.
2. `defineSecretsAdapter<{ credentials?: BootstrapSecret<object>, n: number }>({ runtime: 'x' })` compiles.
3. **Negative:** `defineSecretsAdapter<{ token: Secret }>({ runtime: 'x' })`.
4. **Negative:** `defineSecretsAdapter<{ auth: { token: Secret } }>({ runtime: 'x' })`.
5. `defineStorageAdapter<{ credentials?: Secret<object> }>({ runtime: 'x', secretOptions: { credentials: 'json' } })` compiles.
6. **Negative:** the same call with `secretOptions: { credential: 'json' }` (unknown key).
7. After `declare module '@genoacms/contracts' { interface StorageAdapters { 'x/storage': { a: number } } }` inside the test file, `OptionsOf<StorageAdapters, 'x/storage'>` is `{ a: number }`, and `OptionsOf<StorageAdapters, 'y'>` is `Record<string, unknown>`.
8. `const s: Adapter = …` imported from `'@genoacms/contracts/authentication'` accepts `{ authenticate: async () => null }`, and `Adapter.authenticate` is usable as a type (namespace merge).

## 6. Steps

1. Create the files in §2 with the contents in §4.
2. `pnpm install`.
3. Run §7.

## 7. Verification

```bash
pnpm install
pnpm --filter @genoacms/contracts run test
pnpm --filter @genoacms/contracts run check
git status --short
```

**Expected:**
- Both scripts exit 0.
- `git status` lists only `packages/contracts/` and `pnpm-lock.yaml`.
- `grep -rn "cloudabstraction\|getProvider\|adapterPath" packages/contracts/src` prints nothing.

## 8. Critique

**Pros.** Adapters get a dependency with no loader, no Vite and no rollup. The type rules that
architecture §5.3 depends on are pinned by a compiler-checked test, not by prose.

**Cons & trade-offs.**
- Two copies of the service contracts exist until RFC-0016 deletes the old one. A contract edit in that window must be made twice. The window has no reason to see contract edits.
- `database/index.js` and `authentication/index.js` are empty modules that exist only for runtime resolution.

**Blindspots.**
- `export type *` requires TypeScript ≥ 5.0. The repo pins `^5.x`, but a consumer on 4.x cannot read these types.
- `SvelteKitAdapterFactory` is structural. A SvelteKit adapter with an unusual factory signature type-checks loosely, and errors surface at build time instead.
- `database/types.d.ts` still types `primaryKey` as `{ key, schema }`, while core's collections use `primaryKey: 'id'`. That drift predates this work and is carried unchanged.
