# Configuration architecture

| | |
| :-- | :-- |
| Tier | 1 (architecture). RFCs are derived from this document after it is approved. |
| Status | Draft for review |
| Date | 2026-09-26 |
| Scope | `genoa.config`, `@genoacms/cloudabstraction`, the adapter contract, secrets, `svelte.config.js`, the Vite build, the CLI, the deploy pipeline |
| Verified against | `main` at `9592593` |

This document replaces the external proposal `genoacms-config-architecture.md` (2026-09-10). It keeps
that proposal's core decisions and corrects the parts that did not match the repository or did not
type-check. Section 11 lists what changed and why.

Nothing is released, so there is no migration: every shape below replaces its predecessor outright.

---

## 1. Decisions already made by the author

| # | Decision | Consequence |
| :-- | :-- | :-- |
| U1 | Development and production use **separate config files**, selected explicitly. | No profile or overlay mechanism inside one file (S8). |
| U2 | GCP does not have to build remotely. **Build locally, ship the bundle**, still without uploading `node_modules`. | Build output carries a generated `package.json` of runtime dependencies; the platform installs them (S7). |
| U3 | Inline credentials stay allowed, but only when written explicitly. | `inline()` exists, and a production build warns once per inline field (S6.2). |
| U4 | Package names: `@genoacms/contracts` and `@genoacms/config`. | `@genoacms/cloudabstraction` is deleted (S4). |
| U5 | `database.defaultDatabase` is history. | Dropped (S10). |
| U6 | Core's `dependencies` stay as they are: `vite` and the build tooling are genuinely needed where core is installed as a package and built by the user. | The runtime `package.json` is derived from what the server bundle imports, not from core's `dependencies` (S7.1). |
| U7 | Core's development config keeps today's providers and today's credential files, imported and wrapped in `inline()`. | Core's own CI still cannot load core's dev config (S8). A config that uses `secret()` or `env()` builds with no credential present. |
| U8 | GCP deployment of core moves to a separate production config. | `packages/core/genoa.config.production.ts` (S8). |
| U9 | `--config` is optional on every command, `genoa deploy` included. | Without it, the default lookup applies (S5.5). A development config chosen by mistake for a production build fails the `developmentOnly` check (S8). |
| U10 | The live GCP spike (S-4) is skipped until the production config exists. That config uses `@genoacms/adapter-gcp/secrets`. | The first real GCP deploy is part of the GCP deployment RFC's verification (S13). |
| U11 | `packages/core/.env` holds the dev instance's signing seeds (root, registry sequence, subordinates). The author moves it once, by hand, to `packages/core/.genoacms/secrets.env` when core switches stores. | No path override and no fallback in code. `envDir: false` and `viteConfig.test.ts` are deleted. The core RFC stops for this step, and agents never read or move secret files. |

---

## 2. Reality: the current system

Every statement here was checked against the source. Paths are relative to `packages/`.

### 2.1 Current module graph

```
  process.cwd() ─┐   GENOA_BUILD ─┐   GENOA_CONFIG_PATH ─┐
                 v                v                      v
          cloudAbstraction/src/config/paths.js                     [F1] path inference
                          │ configPath
                          v
  cloudAbstraction/src/config/index.js
     const config = (await import(configPath)).default  ◀──┐       [F2] TLA of user code
     getProvider(type, adapterPath) mutates the config     │       [F4]
                          │ (1) awaits                     │ (3) import { getProvider, config }
                          v                                │
  genoa.config/gcp/index.js                                │
     import credentials from './serviceAccount.json'       │       [F9]
     adapter: import('@genoacms/adapter-gcp/storage') ─(2)─┤       unawaited promise
     adapterPath: '@genoacms/adapter-gcp/storage'          │       [F3]
                                                           │
  @genoacms/adapter-gcp/storage  (module scope) ───────────┘
     const provider = getProvider('storage', ADAPTER_PATH)         [F5] singleton
     const storage  = new Storage({ credentials })

  core/svelte.config.js ── import { config } ──▶ whole graph above    [F7]
  cli/src/deploy.js ────── buildConfig() ──▶ .genoacms/genoa.config    [F6]
```

**Why the cycle works today.** `config/index.js` suspends on `await import(configPath)`. The config
module starts `import('@genoacms/adapter-…')` but does not await it, stores the pending promise, and
finishes. The adapter's static import of `@genoacms/cloudabstraction` finds that module still
evaluating, so the adapter waits for it. When the config import settles, `config` is assigned,
`cloudabstraction` finishes evaluating, and the waiting adapters run `getProvider` against a defined
`config`. If the config module wrote `await import(…)`, each of the three modules would wait on
another and the process would exit with code 13 (unsettled top-level await).
`language-adapter-ts/test/genoa.config/index.js` leaves out `adapter:` for exactly this reason.

### 2.2 Findings

| Id | Finding | Evidence |
| :-- | :-- | :-- |
| F1 | Where the config lives is inferred from `cwd`, a `../../..` walk gated on `GENOA_BUILD`, and `GENOA_CONFIG_PATH`. The GCP deploy walks six directories up to find `.genoacms/build.zip`. | `cloudAbstraction/src/config/paths.js:3-6`, `adapter-gcp/src/services/deployment/deploy.ts:105` |
| F2 | Importing the root `@genoacms/cloudabstraction` evaluates the user's config and every adapter it names, including their SDKs. Subpaths such as `./storage` and `./secrets` do not. Core's unit tests have to `vi.mock` the package to avoid this. | `config/index.js:6`, `index.js`, `core/tests/README.md` |
| F3 | Each adapter hardcodes its own published specifier and must match `adapterPath` in the config. Fixtures already disagree: `adapter-postgres/genoa.config/index.js` imports `../src/index.js` but declares `@genoacms/adapter-postgres`. | every adapter entry |
| F4 | `getProvider` returns the first entry that is not yet marked `isInitialized`, then marks it. The result depends on call order, and it mutates the shared config object. | `config/index.js:13-24` |
| F5 | Adapters are module-level singletons, so two providers naming one adapter share one module and one client. The "two instances of one adapter" goal is unmet everywhere. Adapters also read the whole config (`adapter-gcp/src/config.ts`, `adapter-minio`, `adapter-aws`). | `adapter-gcp/src/services/storage/storage.ts:7-11` |
| F6 | The rollup bundle of the config **is read**, but only by the Node deployment. `adapter-node/src/deploy.js` copies it to `build/genoa.config`, and `paths.js` resolves `cwd/genoa.config/index.js`, so starting the server from `build/` loads that bundle. On GCP the raw config is loaded from the uploaded source instead. The bundle exists only because the config is code. | `adapter-node/src/deploy.js:8-19` |
| F7 | `svelte.config.js` imports the entire config, and therefore every SDK, only to read one string: which SvelteKit adapter to use. `vite build` therefore needs real credentials, so CI cannot build. | `core/svelte.config.js:2-7`, `.github/workflows/ci.yml`, `core/playwright.config.ts:6-7` |
| F8 | Type drift: `adapter-gcp/src/genoa.config.d.ts` passes three generic arguments to a one-parameter `Config`. `adapter-aws/src/config.d.ts` refers to a `genoaConfig` type that does not exist. `cli/src/genoa.config.js` and `adapter-gcp/genoa.config.js` use the old singular `adapter:` shape, and `cli/src/database.js:12` reads `config.storage.adapter`, which the loader no longer produces. | as listed |
| F9 | The service-account key lives in the config directory, protected only by `.gitignore`. **Worse: the GCP deploy uploads it.** `deploy.ts` archives `**` from the project root, ignoring only `node_modules`, `.git`, `.github`, `.gitignore`, `.genoacms` and `build`, so `genoa.config/gcp/serviceAccount.json` goes into the source archive sent to GCP. | `core/genoa.config/gcp/index.js:1`, `deploy.ts:104-120` |
| F10 | "First deployment provider is the default" is decided separately in `svelte.config.js` and in `cli/deploy.js`. Deployment providers are looked up by `name`, every other service by `adapterPath`. | `svelte.config.js:4`, `cli/src/deploy.js:12` |
| F11 | `adapter-secrets-env` resolves `.env` against `cwd`. Under `genoa run` that is `node_modules/@genoacms/core`, not the project. Because the store is named `.env`, core had to set `envDir: false`. | `adapter-secrets-env/src/index.js:21`, `core/vite.config.ts:6-24` |
| F12 | The config is evaluated by two processes with two working directories (the CLI in the project, and `svelte.config.js` inside core). `../../..` exists only to reconcile them. | `cli/src/deploy.js`, `paths.js` |
| F13 | `@genoacms/cloudabstraction` mixes service contracts, a config loader and a rollup-based build tool. Every adapter therefore inherits rollup as a peer dependency. | `cloudAbstraction/package.json` |
| F14 | `adapter-aws` is written against a config shape that no longer exists (`config.storage.region`, bucket names as plain strings). It cannot run. | `adapter-aws/src/services/*` |
| F15 | **GCP deploy is broken today.** It injects `deployment/snippets/build.js`, which does not exist. The model it assumes is a remote build: upload the project source, and the entry snippet imports `./node_modules/@genoacms/core/build/index.js` after GCP has installed and built. | `deploy.ts:107`, `adapter-gcp/deployment/snippets/` |
| F16 | Nothing calls `SecretReference` or `isSecretReference`. They are declared, and no resolution mechanism exists. | `cloudAbstraction/src/services/secrets/index.d.ts` |
| F17 | `@genoacms/sveltekit-adapter-cloud-run-functions` needs its `files/` directory built (`rollup -c`) before use. That directory is gitignored and absent in a fresh checkout, so the GCP target cannot build from the monorepo without that step. Published packages include it through `prepublishOnly`. | `sveltekit-adapter-cloud-run-functions/index.js:8`, `.gitignore` |

### 2.3 Constraints the design must respect

These are facts about the tools, not choices. A design that ignores one fails in practice.

| Id | Constraint | Evidence |
| :-- | :-- | :-- |
| R1 | SvelteKit loads `svelte.config.js` from `process.cwd()`. No other channel reaches it: no arguments, no hook. | `@sveltejs/kit/src/core/config/index.js:129-154` |
| R2 | Both SvelteKit adapters in use, `@sveltejs/adapter-node` 5.5 and `@genoacms/sveltekit-adapter-cloud-run-functions`, re-bundle the server with rollup. They leave external **exactly** the `dependencies` of `package.json` in `process.cwd()` and bundle everything else. | `adapter-node/index.js:55,75-78`, `sveltekit-adapter-cloud-run-functions/index.js:49,59-62` |
| R3 | Consequence of R1 and R2: the Vite build runs with `cwd` = the core package, so only packages in core's `dependencies` can stay external; the ones the server imports are. Adapter packages are not among them, so a literal `import('@genoacms/adapter-gcp/storage')` in core's code would be **bundled**, together with the cloud SDK behind it. | R1, R2 |
| R4 | Cloud Run functions always builds a container through Cloud Build buildpacks, which run `npm install` on the uploaded `package.json`. Uploading `node_modules` is never necessary. | GCP platform behavior |
| R5 | Vite 7.3 (`core` uses `^7.3.1`) exports `runnerImport(moduleId, inlineConfig)` → `{ module, dependencies }`. It evaluates a TypeScript module and its imports without a running dev server. It is marked `@experimental`. | `vite/dist/node/index.d.ts:3576-3584` |
| R6 | `@genoacms/adapter-secrets-env` is documented as development only. | `adapter-secrets-env/README.md` |
| R7 | The authorization vs. security distinction (authority re-read on every resolution, versus seeds for the signed policy) is a requirement, carried verbatim from `cloudAbstraction/src/config/genoa.config.d.ts`. | same |
| R8 | Core's `build` script runs `pnpm --filter @genoacms/language-adapter-ts run build`, which works only inside the monorepo. The CLI must not invoke core's npm scripts. | `core/package.json:15-17` |

---

## 3. Goals and non-goals

### Goals (not negotiable)

1. Any platform through an adapter: first-party (GCP, AWS, MinIO, Postgres, Node, env secrets, array auth, TypeScript language) and third-party.
2. Several providers serving one service at once, **including two instances of the same adapter**.
3. The full service set: `authentication`, `database`, `storage`, `deployment`, `secrets`, `languages`. Plus `authorization`, `security` and collection definitions.
4. Deployment targets that choose a SvelteKit adapter at build time and run a deploy procedure.
5. Credentials can live in a secret manager. A reference is resolved at runtime and is never baked into the build.
6. `vite build` constructs no client and resolves no secret. A config that uses only `secret()` and `env()` builds with no credential present. Core's own dev config imports credential files by choice (U7), so it still needs them to load.
7. All current functionality preserved (S10).

### Non-goals

- Live credential rotation inside a running process. Rotation takes effect on restart (S6.5).
- Hot-applying config changes in dev without restarting the server.
- More than one secrets provider.
- Linking `@genoacms/core` from outside the project (`link:` or `file:` pointing elsewhere). Adapter resolution relies on standard walk-up from the installed core (S5.4).
- Mapping secret-store outages to HTTP 503. Errors stay 500, as today.
- Fixing plain-text password comparison in `authentication-adapter-array`. A separate task.
- Changing core's `dependencies` (U6).
- A credential-free CI build of core itself (U7).

---

## 4. Decisions

**D1. The config is data.** A config file is a module that must **evaluate to** a plain,
JSON-serializable object. It may import helpers and collection files. It may not import adapters,
and it may not contain credential values except through `inline()`. The loader evaluates it on a
developer machine or CI runner and produces a **manifest**. Every later phase reads the manifest,
never the module.
*Why:* removes the cycle (F2), the bundling step (F6) and SDK loading at build time (F7).
*Cost:* the config cannot compute anything at runtime. Nothing needs to today.

**D2. Adapters are two modules: a descriptor and a runtime.** The *descriptor* is SDK-free. It declares
the service kind, which options are secrets, whether the adapter is development-only, an option
validator, and the bare specifier of its runtime module. The *runtime* exports a factory
`create(resolvedOptions, ctx)`. The config names the descriptor.
*Why:* the loader and the build can validate every provider, and choose a SvelteKit adapter, without
loading a single SDK. That is D1 applied to adapters. The external proposal ran validators inside the
adapter module, which brought F7 back.
*Cost:* an adapter ships two entry points per service.

**D3. The host constructs providers; adapters never see the config.** A per-process host holds the
manifest. For each provider entry it resolves the secret references, loads the runtime by specifier
and calls `create`. It caches the **promise** of each construction per provider name, and drops a
promise that rejects.
*Why:* two entries naming one adapter become two `create` calls (F5). No self-identifying string (F3),
no shared mutable state (F4).
*Cost:* first use of a provider is async and can fail. The host is one more object to hand to tests.

**D4. Adapter runtimes are loaded by bare specifier at runtime, not bundled.** The host's loader is a
dynamic `import()` whose argument rollup cannot analyze. Adapter packages therefore stay external in
every SvelteKit adapter's output (R3), and the build emits a `package.json` naming them next to core's
own externals (D6).
*Why:* bundling cloud SDKs through a SvelteKit adapter's rollup pass is fragile (for example, gRPC
clients loading proto files by path) and outside our control for third-party SvelteKit adapters.
*Cost:* the deployment must install dependencies. Every target already has to, for core's own
externals.

**D5. Secrets are typed references, resolved by the host just before construction.**
`secret('KEY')`, `env('VAR')` and `inline(value)` are the only ways to fill a credential option. Each
adapter's option types say which fields are credentials, and its descriptor says the same at runtime.
The secrets provider's own options admit `env()` and `inline()` only: the bootstrap rule, enforced by
the type and by the loader.

**D6. A build produces a self-contained, self-describing artifact.** It contains the SvelteKit output
and a generated `package.json`, pinned to the installed versions. That file lists the packages the
server bundle actually imports, plus every adapter package the manifest names. It contains no project
source, no config file and no deployment options. Targets add their own entry glue and install
dependencies in their own way (R4).
*Why derived from the bundle:* core's `dependencies` must keep build tooling such as `vite`, because a
user installs core as a package and builds it (U6). Copying that list would install the build
toolchain on every function. The bundle's imports are the exact set the running server needs.

**D7. Explicit facts cross the process boundary, as absolute paths or names.** The CLI is the only
entry point. It spawns Vite with `cwd` = core (R1) and passes `GENOA_PROJECT` (absolute project
root), `GENOA_CONFIG` (absolute config file, optional), `GENOA_TARGET` (target name, build only) and
`GENOA_MODE` (`development` or `production`). There are no relative directory walks.
*Why `GENOA_MODE` is explicit:* Vite's `mode` is not reliable inside a SvelteKit build. One
`vite build --mode development` fired the plugin's `configResolved` eight times, and some of those
calls reported `production` (S-2 result, S13). SvelteKit runs extra internal Vite builds and resolves
the Vite config while loading its own config. When `GENOA_MODE` is unset (monorepo `pnpm dev` or
`pnpm build`), the plugin falls back to `development` for `vite dev` and `production` for `vite build`.
That fallback depends only on `command`, which was consistent across every call.

---

## 5. Architecture

### 5.1 Packages and dependency direction

```
@genoacms/contracts        service contracts, reference types, descriptor & runtime types,
  (no runtime deps)        registry interfaces, define* helpers, schema helpers,
                           PreconditionFailedError, secret-key rule
        ▲         ▲
        │         └──────────────────────────────┐
@genoacms/adapter-*                              │
  <svc>            descriptor (SDK-free)         │
  <svc>/runtime    factory (SDKs)                │
                                                 │
@genoacms/config ────────────────────────────────┘
  .                defineConfig, *Provider(), secret/env/inline
  ./load           loadConfig → Manifest, resolveKitAdapter,         (uses vite runnerImport,
                   importFromProject                                   import-meta-resolve)
  ./host           createHost                                        (runtime-safe, no vite)
  ./vite           genoa() plugin: virtual:genoa/manifest
  ./build          createRuntimePackage(manifest, coreDir)
        ▲
        ├──────────── @genoacms/core      host.server.ts, svelte.config.js, vite.config.ts
        └──────────── @genoacms/cli       dev, build, deploy, database, roles, rotate-root, init
@genoacms/conformance      storage & database suites (vitest peer), used by adapters' tests
```

Rules. An adapter imports only `@genoacms/contracts`. Nothing imports a config file except
`loadConfig`. Nothing imports an adapter runtime except the host's loader. `@genoacms/config/host`
does not import Vite, because it ships inside the server bundle.

The conformance suites leave `contracts` for their own package, so contracts stays free of test
tooling.

`LanguageAdapter` **stays** in `@genoacms/internal/languageAdapter`. Its types are built from
`internal`'s `attributes`, `executable`, `sast` and `guards`, and eight core modules import it from
there. `@genoacms/contracts` depends on `@genoacms/internal`, as `cloudabstraction` does today, and
imports the type for `defineLanguageAdapter` and the `LanguageAdapters` registry. (Corrected while
writing the RFCs. An earlier draft moved it, which would have made `contracts` re-export half of
`internal`.)

### 5.2 Module graph after

```
genoa.config.ts ──imports──▶ collections.ts, @genoacms/config (helpers), adapter types (type-only)
      │  runnerImport (dev machine / CI only)
      v
  Manifest (JSON) ────────────────────────────────────────────────┐
      │                              │                            │
      v                              v                            v
 @genoacms/config/vite         svelte.config.js              @genoacms/cli
  virtual:genoa/manifest        resolveKitAdapter()           loadConfig(), createHost(),
  (runtime manifest)            → target descriptor           deploy procedure
      │                         → SvelteKit adapter
      v
 core: host.server.ts ── createHost({ manifest, load }) ──▶ @genoacms/config/host
      │                                                          │  load(runtimeSpecifier)
      v                                                          v   = import(/* opaque */ s)
 service layer (storage.server.ts, …)                    @genoacms/adapter-*/…/runtime
                                                                 │
                                                                 v
                                                         @genoacms/contracts (types)
```

Every arrow points down. The only `import()` of an adapter is in the host loader, after the manifest
exists.

### 5.3 Types: references and the registry (`@genoacms/contracts`)

Checked with `tsc --strict`, including the negative cases marked `must not compile`.

```ts
/** A value fetched from the configured secrets provider when a provider is constructed. */
interface SecretRef { readonly $secret: string }
/** A value read from process.env when a provider is constructed. */
interface EnvRef { readonly $env: string }
/** A literal that travels with the build. Visible by design: a search for `inline(` finds every one. */
interface InlineRef<T> { readonly $inline: T }

/** An option that holds a credential. `T` is the resolved type: `string`, or an object for JSON credentials. */
type Secret<T = string> = SecretRef | EnvRef | InlineRef<T>
/** A credential the secrets provider itself may take. It cannot reference the store it configures. */
type BootstrapSecret<T = string> = EnvRef | InlineRef<T>

/** Options as `create` receives them: every reference replaced by its value. Optional fields stay optional. */
type ResolvedValue<V> =
  [V] extends [SecretRef | EnvRef | InlineRef<infer T>] ? T :
  V extends readonly (infer E)[] ? ResolvedValue<E>[] :
  V extends object ? Resolved<V> : V
type Resolved<O> = {
  [K in keyof O]: ResolvedValue<NonNullable<O[K]>> | (undefined extends O[K] ? undefined : never)
}

/** True when any field of O, at any depth, accepts a SecretRef. Used for the bootstrap rule. */
type ContainsSecretRef<O> = true extends {
  [K in keyof O]-?: [Extract<NonNullable<O[K]>, SecretRef>] extends [never]
    ? (NonNullable<O[K]> extends object ? ContainsSecretRef<NonNullable<O[K]>> : false)
    : true
}[keyof O] ? true : false

/**
 * Adapter descriptor specifier → option type. Adapters extend these by module augmentation, so each
 * provider entry is typed by the string naming its adapter. Replaces the `Extension` generic (F8).
 * An unregistered specifier gets `Record<string, unknown>`: it configures, unchecked.
 */
interface StorageAdapters {}
interface DatabaseAdapters {}
interface AuthenticationAdapters {}
interface SecretsAdapters {}
interface LanguageAdapters {}
interface DeploymentTargets {}
type OptionsOf<R, S extends string> = S extends keyof R ? R[S] : Record<string, unknown>
```

**One JSON rule, stated once.** `secret()` and `env()` always yield strings. When the descriptor
declares an option as `'json'`, the host parses the string before calling `create`. `inline()` passes
its value through unchanged. There is no content sniffing, so a string secret that happens to begin
with `{` is never misread.

### 5.4 Types: adapters (`@genoacms/contracts`)

```ts
type SecretEncoding = 'string' | 'json'

/** SDK-free. The module at the specifier the config names. */
interface AdapterDescriptor<Kind extends string, O extends object> {
  readonly kind: Kind
  /** Bare specifier of the runtime module, e.g. '@genoacms/adapter-gcp/storage/runtime'. Never relative. */
  readonly runtime: string
  /** Top-level options that hold references, with how to decode them. References anywhere else are refused. */
  readonly secretOptions?: { readonly [K in keyof O]?: SecretEncoding }
  /** Refused by a production build (S6.6). */
  readonly developmentOnly?: boolean
  /** Checks unresolved options. Returns the reasons they are invalid; empty means valid. */
  readonly validate?: (options: unknown) => string[]
}

interface AdapterContext {
  /** The provider's key in the config. Used in log lines only, never for lookup. */
  readonly name: string
  /** The resources bound to this provider: bucket names for storage, database names for a database. */
  readonly resources: readonly string[]
  /** Present in the dev server, the CLI and development builds. Absent in a production artifact. */
  readonly projectRoot?: string
}

/** Default export of a runtime module. */
interface AdapterRuntime<O extends object, Instance> {
  readonly create: (options: Resolved<O>, ctx: AdapterContext) => Instance | Promise<Instance>
}

/**
 * Deployment is the one service whose descriptor carries build-time behavior.
 *
 * Both loaders are functions written inside the descriptor module, e.g.
 * `svelteKitAdapter: () => import('@sveltejs/adapter-node')`, so each specifier resolves from the
 * adapter package that declares the dependency. Importing '@sveltejs/adapter-node' by name from core
 * fails under strict pnpm (S-5). The rule: a string where the value crosses into the manifest
 * (`runtime`), a loader function where the descriptor itself is at hand.
 */
interface DeploymentDescriptor<O extends object> {
  readonly kind: 'deployment'
  /** Loads the SvelteKit adapter factory. Called by svelte.config.js only. */
  readonly svelteKitAdapter: () => Promise<{ default: (options?: Record<string, unknown>) => import('@sveltejs/kit').Adapter }>
  /** SvelteKit adapter options. Receives unresolved options: credentials never influence the build. */
  readonly svelteKitOptions?: (options: O, ctx: { outDir: string }) => Record<string, unknown>
  /** Loads the module exporting the DeployProcedure. Called by `genoa deploy` only. */
  readonly procedure: () => Promise<{ default: DeployProcedure<O> }>
  readonly secretOptions?: { readonly [K in keyof O]?: SecretEncoding }
  readonly validate?: (options: unknown) => string[]
}

interface DeployContext {
  readonly projectRoot: string
  /** Absolute path of the build artifact (S7.1). */
  readonly buildDir: string
  /** Absolute scratch directory owned by this deploy. */
  readonly workDir: string
  readonly target: string
}
type DeployProcedure<O extends object> = (options: Resolved<O>, ctx: DeployContext) => Promise<void>
```

Service instances (`StorageAdapter`, `DatabaseAdapter`, `AuthenticationAdapter`, `SecretsAdapter`,
`LanguageAdapter`) keep today's method signatures unchanged.

`defineStorageAdapter`, `defineDatabaseAdapter`, `defineAuthenticationAdapter`,
`defineLanguageAdapter` and `defineDeploymentTarget` stamp `kind` onto a descriptor.
`defineSecretsAdapter` also enforces the bootstrap rule at compile time:

```ts
type BootstrapGuard<O> = ContainsSecretRef<O> extends true
  ? { readonly 'secrets adapter options may not accept secret()': never }
  : unknown
declare function defineSecretsAdapter<O extends object> (
  d: Omit<AdapterDescriptor<'secrets', O>, 'kind'> & BootstrapGuard<O>
): AdapterDescriptor<'secrets', O>
```

**Example: the GCP storage adapter's two modules.**

```ts
// @genoacms/adapter-gcp/storage  — descriptor, imports nothing but contracts
import { defineStorageAdapter, type Secret } from '@genoacms/contracts'

export interface ServiceAccount { client_email: string, private_key: string, project_id?: string }
export interface GcpStorageOptions {
  projectId: string
  /** Omitted: Application Default Credentials, i.e. the runtime's own identity. */
  credentials?: Secret<ServiceAccount>
}
declare module '@genoacms/contracts' {
  interface StorageAdapters { '@genoacms/adapter-gcp/storage': GcpStorageOptions }
}
export default defineStorageAdapter<GcpStorageOptions>({
  runtime: '@genoacms/adapter-gcp/storage/runtime',
  secretOptions: { credentials: 'json' },
  validate: o => typeof (o as GcpStorageOptions).projectId === 'string' ? [] : ['projectId is required']
})
```

```ts
// @genoacms/adapter-gcp/storage/runtime  — the only module that imports the SDK
import { Storage } from '@google-cloud/storage'
import type { AdapterRuntime, StorageAdapter } from '@genoacms/contracts'
import type { GcpStorageOptions } from './descriptor.js'

export default {
  create ({ projectId, credentials }, ctx) {
    const storage = new Storage(credentials === undefined ? { projectId } : { projectId, credentials })
    const bound = new Set(ctx.resources)
    const bucket = (name: string) => {
      if (!bound.has(name)) throw new Error(`bucket-unregistered: ${name} is not bound to ${ctx.name}`)
      return storage.bucket(name)
    }
    return { /* today's ten methods, with getBucket replaced by bucket() */ }
  }
} satisfies AdapterRuntime<GcpStorageOptions, StorageAdapter>
```

### 5.5 Types: the config and the manifest (`@genoacms/config`)

```ts
interface ProviderEntry<S extends string = string, O = unknown> { readonly adapter: S, readonly options: O }
type Providers = Record<string, ProviderEntry>

/** Typed constructors, one per service, so the registry lookup is unambiguous. */
declare function storageProvider<S extends string> (adapter: S, options: OptionsOf<StorageAdapters, S>): ProviderEntry<S, OptionsOf<StorageAdapters, S>>
// databaseProvider, authenticationProvider, secretsProvider, languageProvider, deploymentTarget: same shape

declare function secret (key: string): SecretRef   // key must match SECRET_KEY_PATTERN
declare function env (variable: string): EnvRef
declare function inline<T> (value: T): InlineRef<T>

interface Config<AP extends Providers, DP extends Providers, SP extends Providers,
                 XP extends Providers, LP extends Providers, TP extends Providers> {
  authentication: { providers: AP, cookieName: string }            // tried in key order; first Identity wins
  database: { providers: DP, databases: Record<string, { provider: keyof DP & string, collections: CollectionReference[] }> }
  storage: {
    providers: SP
    buckets: Record<string, { provider: keyof SP & string }>
    defaultBucket: string
    /** Segment separator in storage browser URLs. Default '|->'. */
    pathDelimiter?: string
  }
  secrets: { providers: XP }                                        // exactly one key, enforced by the loader
  languages: { providers: LP }                                      // keyed by language name
  /** Optional: a config used only by the dev server needs no target. A build requires one. */
  deployment?: { targets: TP, default?: keyof TP & string }
  authorization: AuthorizationConfig                                // unchanged, doc comments verbatim (R7)
  security: SecurityConfig                                          // unchanged, doc comments verbatim (R7)
}

/** Identity function. Exists so provider keys are inferred and cross-references are checked. */
declare function defineConfig<AP extends Providers, DP extends Providers, SP extends Providers,
  XP extends Providers, LP extends Providers, TP extends Providers> (
  config: Config<AP, DP, SP, XP, LP, TP>): Config<AP, DP, SP, XP, LP, TP>
```

`tsc --strict` checks all of the following:
- `buckets.x.provider: 'typo'` is an error.
- A bare object in a `Secret<ServiceAccount>` field is an error.
- `secret()` in a `BootstrapSecret` field is an error.
- A secrets adapter whose options accept `secret()` does not compile.
- An unregistered specifier accepts any options.

```ts
/** What loadConfig produces and every later phase reads. JSON-serializable by construction. */
interface Manifest {
  readonly version: 1
  readonly mode: 'development' | 'production'
  readonly config: SerializedConfig        // the Config, helpers collapsed to $secret/$env/$inline objects
  /** Per descriptor specifier, what the host needs without loading the descriptor again. */
  readonly adapters: Readonly<Record<string, {
    kind: string, runtime: string, secretOptions: Record<string, SecretEncoding>, package: string, version: string
  }>>
  /** Development only: the project root and the config's import graph. Absent from production manifests. */
  readonly source?: { root: string, file: string, dependencies: readonly string[] }
}

/** The subset embedded in the server bundle: `deployment` and `source.dependencies` removed. */
type RuntimeManifest = Omit<Manifest, 'config'> & { readonly config: Omit<SerializedConfig, 'deployment'> }

interface LoadOptions {
  root: string                              // absolute project root
  file?: string                             // absolute config file; default lookup below
  mode: 'development' | 'production'
  forbidInline?: boolean                    // `genoa build --no-inline`
}
declare function loadConfig (options: LoadOptions): Promise<Manifest>   // rejects with every reason listed
```

**Default lookup** under `root`: `genoa.config.{ts,mts,js,mjs}`, then `genoa.config/index.{ts,mts,js,mjs}`.

**Loader rules**, all enforced before a manifest exists:

1. Evaluate the file with Vite's `runnerImport` (R5). It supports TypeScript, JSON imports with `with { type: 'json' }` and plain `.js` modules, and records the import graph. That graph **excludes the config file itself**, so the watch list is the file plus `dependencies` (S-2). One build calls the loader several times (D7), so `loadConfig` memoizes per process by file and mode. An evaluation takes about 70–80 ms.
2. Load the descriptor of every provider entry with `importFromProject(specifier, root)`. That resolves the specifier with Node's ESM algorithm, with `<root>/package.json` as the parent (via `import-meta-resolve`), then does a native `import()` of the file. Resolution is anchored at the project, not at wherever `@genoacms/config` or the CLI is installed. In the monorepo those are separate workspace packages that do not depend on core's adapters (S-7). A descriptor is SDK-free, so this loads no SDK. Check that `kind` matches the service the entry is configured under, and that deployment targets have `kind: 'deployment'`.
3. Run each descriptor's `validate`.
4. Each field listed in `secretOptions` must hold a reference, or be absent. A reference anywhere else is refused, and so is a bare literal in a listed field.
5. No `$secret` anywhere under `secrets.providers` (the bootstrap rule).
6. Every `$secret` key matches `SECRET_KEY_PATTERN`.
7. `secrets.providers` has exactly one key.
8. Every `provider` reference and `deployment.default` names an existing key.
9. Provider keys are not integer-like. Object key order is the authentication trial order, and JavaScript moves integer-like keys first.
10. `JSON.parse(JSON.stringify(config))` deep-equals `config`, which proves D1.
11. In `production` mode: a `developmentOnly` adapter is an error, and each `inline()` warns by path (or is an error with `forbidInline`).

### 5.6 Types: the host (`@genoacms/config/host`)

```ts
type RuntimeLoader = (specifier: string) => Promise<{ default: AdapterRuntime<object, unknown> }>

interface HostOptions {
  manifest: RuntimeManifest | Manifest
  /** Injected by the caller. In core and the CLI it is `s => import(/* @vite-ignore */ s)`. */
  load: RuntimeLoader
  /** Defaults to manifest.source?.root. */
  projectRoot?: string
  /** Per getSecret call. Default 10 000. */
  secretTimeoutMs?: number
  environment?: Record<string, string | undefined>   // default process.env; injectable for tests
}

interface Host {
  storage (provider: string): Promise<StorageAdapter>
  database (provider: string): Promise<DatabaseAdapter>
  authentication (provider: string): Promise<AuthenticationAdapter>
  language (language: string): Promise<LanguageAdapter>   // checks adapter.language === key
  secrets (): Promise<SecretsAdapter>                     // the sole store; constructed from env()/inline() only

  storageForBucket (bucket: string): Promise<StorageAdapter>
  databaseForCollection (collection: string): Promise<DatabaseAdapter>
  authenticationProviders (): Promise<AuthenticationAdapter[]>   // in key order

  readonly authorization: AuthorizationConfig
  readonly security: SecurityConfig
  readonly cookieName: string
  readonly defaultBucket: string
  readonly pathDelimiter: string
  readonly buckets: readonly string[]
  readonly collections: readonly CollectionReference[]

  /** Resolves one options object against a descriptor's secretOptions. Used by `genoa deploy`. */
  resolve<O extends object> (options: O, secretOptions: Record<string, SecretEncoding>, path: string): Promise<Resolved<O>>
  /** Awaits pending constructions and drops them. CLI only; a server never calls it. */
  close (): Promise<void>
}
declare function createHost (options: HostOptions): Host   // performs no I/O
```

**Construction, per provider name:**

```
host.storage(name)
  cached = constructions.get(name);  if cached: return cached          ← the promise, not the instance
  p = (async () => {
        entry    = manifest.config.storage.providers[name]   ?? throw provider/not-found
        meta     = manifest.adapters[entry.adapter]
        options  = await resolve(entry.options, meta.secretOptions)       ← may call host.secrets()
        runtime  = (await load(meta.runtime)).default
        return runtime.create(options, { name, resources: bucketsOf(name), projectRoot })
      })()
  constructions.set(name, p)
  p.catch(() => constructions.delete(name))                              ← failures are retried
  return p
```

Caching by provider name, and by nothing else, is the whole of the "two instances" fix.
`host.secrets()` follows the same pattern, except that it resolves only `env()` and `inline()`, so it
never calls itself.

---

## 6. Secrets

### 6.1 Where a reference is resolved, and what holds the value

References are resolved only in `host.resolve`: when the host constructs a provider, and when
`genoa deploy` prepares a target's options. `core/src/lib/script/secrets/references.server.ts` is
deleted, and its "throw naming the field" behavior moves into the resolver.

Resolved values live in exactly three places:
1. the adapter's closure after `create`;
2. the host's per-process secret cache, keyed by secret name, which also collapses concurrent reads of one key;
3. the transient options object passed to `create`.

A value is never held in the manifest (except `inline()`), in the Vite module graph, or in an error
message. Errors name the path and the reference: `storage.providers.gcs.options.credentials →
GCS_SA`.

The signing seeds and the registry sequence, which core reads through `host.secrets()` directly, bypass
this cache. They keep the `getOrClaimSecret` and `setSecretIfAbsent` semantics they have today.

### 6.2 `inline()`

It is allowed (U3). A bare literal in a secret field is a type error and a load error, and `inline(x)`
is the explicit way to write one. In production mode, `loadConfig` warns once per field:
`storage.providers.gcs.options.credentials is inline: this value is written into the build`.
`genoa build --no-inline` turns the warnings into errors. The runtime manifest therefore holds a
credential only when the operator wrote `inline()`. Inline values under `deployment.targets` do not
warn: deployment options never enter the runtime manifest.

### 6.3 Bootstrap ordering

```
1. host.secrets()        options: env() / inline() only       → no network before the store exists
2. host.storage(x)       options may contain secret()         → store round trip(s), concurrent per provider
3. host.database(y)      same, on first use
```

The rule is stated three times, and all three agree:
- the `BootstrapSecret` field type, for config authors;
- `defineSecretsAdapter`'s guard, for adapter authors;
- loader rule 5, at runtime.

**Recommended production form:** `@genoacms/adapter-gcp/secrets` with `credentials` omitted, which
uses Application Default Credentials (on Cloud Run, the function's own service account). Every other
credential is then a `secret()`, and no credential exists in the config or the environment at all.

`env()` is not a second store. The single-authority argument is about *writes*: `setSecret` has one
target. `env()` is read-only and resolved by the host, so single-provider stays.

### 6.4 Failure and latency in production

- `createHost` does no I/O. The first I/O happens in `ensureInstanceInitialized()`: store construction, then the root-seed claim (already a secret read today), then the default bucket's provider.
- A provider's references are fetched concurrently, so a provider costs one round trip of latency. A request that never touches a database never resolves the database's secrets.
- Each `getSecret` is bounded by `secretTimeoutMs`, default 10 s. On timeout or a missing key, the construction rejects with `provider/secret-unavailable` or `secrets/missing`, naming the provider and the reference. The rejection is **not** cached, so the next call retries. `GrantCache` already follows the same rule.
- Callers are unchanged: `ensureInstanceInitialized` catches and logs, and never rejects (K1). A request that needs the provider fails with 500.
- Operators who want no round trip can mount secrets as environment variables (Cloud Run and Lambda both support this natively) and write `env()`.

### 6.5 Caching and rotation

Resolved values are cached for the life of the process. A constructed client holds its credential no
matter what the cache does, so rotation means reconstructing the provider, and the honest unit of
reconstruction is the process. On serverless platforms the next cold start reads the new version.
A long-running Node server applies rotation on restart, and a deploy restarts it anyway. No TTL, no
reload endpoint, no admin socket.

### 6.6 Development store

`@genoacms/adapter-secrets-env`:
- Its descriptor is `developmentOnly: true`, so a production build refuses it (R6).
- Its runtime requires `ctx.projectRoot`, which exists in the dev server, the CLI and development builds.
- The default path is `<projectRoot>/.genoacms/secrets.env`, not `.env`. Vite does not watch it, so `envDir: false` and `viteConfig.test.ts` go away (F11).
- Reads check, in order: this instance's own writes, then `process.env`, then the file. Writes update the instance's overlay. Today's adapter writes `process.env` to get the same effect, and without an overlay a shell variable would hide every later write, including a key rotation.
- Nothing is written into `process.env`.
- Cross-process `setSecretIfAbsent` keeps its lock file. File mode stays `0600`.

`.genoacms/` is added to `.gitignore`.

---

## 7. Build and deployment

### 7.1 The artifact

```
<project>/.genoacms/
  build/                    SvelteKit adapter output (adapter `out`, set by svelte.config.js)
    package.json            generated: { type: "module", dependencies: core deps ∪ adapter packages }
    …                       server bundle with the runtime manifest embedded; client assets
  deploy/<target>/          workDir of a deploy procedure
```

`createRuntimePackage(manifest, buildDir, coreDir)` builds `package.json` from:
- **the bundle's imports:** every bare specifier in a static or string-literal dynamic `import` in the server output, reduced to its package name. `node:` builtins are ignored. Anything bare left in the output is external by definition (R2), so it must be installed, and nothing else needs to be. Core's build tooling (`vite`, `vitest`, `tailwindcss`) never appears there.
- **the adapter packages:** the package of every runtime specifier in `manifest.adapters`. The host imports these with a non-literal specifier (D4), so no scan can see them.
- **versions** read from each package's installed `package.json`, resolved from `coreDir`.

It contains no workspace protocols and no dev dependencies. Core's own `package.json` is not changed.

**Measured on real core** (S-6, adapter-node build of `9592593`): the server imports 12 of core's 45
`dependencies`. They are `@exodus/schemasafe`, `@noble/hashes`, `@noble/post-quantum`, `@sveltejs/kit`,
`canonicalize`, `deep-diff`, `dompurify`, `flatted`, `highland`, `jose`, `jsdom` and `marked`, and the
generated `package.json` installs 126 packages (67 MB). `vite`, `vitest`, the tailwind packages,
`typescript`, codemirror and every `@types/*` are absent. The only non-literal imports in the output are
Svelte's `obfuscated_import('node:crypto')` (a builtin) and today's config loader, which this design
removes. There are no `require()` or `createRequire` calls.

Two properties of the output the RFCs must not trip over:
- **The scan is per build.** In the monorepo, Vite inlines symlinked workspace packages such as `@genoacms/internal`. In a user install the same packages are external. The scan reads whichever output exists, so it is correct in both cases, but the two lists differ.
- **Rollup tree-shakes manifest properties the server never reads.** The embedded manifest is not a complete copy and must not be treated as one, for example when auditing an artifact for `inline()` values. Audit the manifest the loader produced instead.

**Constraint:** every listed package must be installable from the registry where the target installs
dependencies. Deploying from the monorepo therefore requires published versions. GCP's remote install
already has this constraint today.

SvelteKit's intermediate `.svelte-kit/` stays inside the installed core package. Moving it would
break core's `tsconfig.json`, which extends `./.svelte-kit/tsconfig.json`. The build only creates new
files there and never modifies installed ones.

### 7.2 Targets

| Target | SvelteKit adapter | Procedure |
| :-- | :-- | :-- |
| `@genoacms/adapter-node` | `@sveltejs/adapter-node` | Copies `buildDir` to `options.outDir` (default `<project>/build`). The operator runs `npm install --omit=dev` there, as with any adapter-node output. |
| `@genoacms/adapter-gcp/deployment` | `@genoacms/sveltekit-adapter-cloud-run-functions` | Archives `buildDir`. Adds a generated `function.js` that exports `genoacms` from the build's handler, and sets `"main": "function.js"` in the archived `package.json`. Uploads, then creates or updates the function. Buildpacks install the dependencies (R4). **No project source and no config leave the machine** (fixes F9, F15). |
| `@genoacms/adapter-aws/deployment` | `@sveltejs/adapter-node` + the Lambda wrapper | Ported (F14). Lambda does not install dependencies, so the procedure runs `npm install --omit=dev` in its `workDir` before zipping. |

---

## 8. Config files per environment (U1)

A project holds one config file per environment. Shared parts are ordinary TypeScript modules:

```
genoa.config.ts                 development: secrets-env, local storage/database, target `local`
genoa.config.production.ts      production: Secret Manager (ADC), cloud providers, target `gcp`
genoa/collections.ts            shared
genoa/authorization.ts          shared roles and assignments
```

Every CLI command accepts `--config <file>`, which defaults to the lookup in S5.5. Choosing the wrong
file for a production build is caught at build time, because the dev config's secrets store is
`developmentOnly`. `GENOA_CONFIG_PATH` is removed. Its two users, the test fixtures in
`language-adapter-ts` and `sdk`, construct their adapter directly and no longer need a config.

**Core's own configs** (U7, U8):

| File | Providers | Credentials |
| :-- | :-- | :-- |
| `packages/core/genoa.config.ts` (development) | Today's set: GCS (`FIM-gcs`), Firestore, `secrets-env`, `authentication-adapter-array`, `language-adapter-ts`; target `local` (`adapter-node`) | Today's gitignored files, imported and wrapped: `inline(serviceAccount)` and `inline(authCredentials)`, imported from where they are now (`genoa.config/gcp/serviceAccount.json`, `genoa.config/gcp/authCredentials.js`). `genoa.config/index.js` and `genoa.config/gcp/index.js` are removed, so the default lookup finds `genoa.config.ts`. Development mode does not warn. |
| `packages/core/genoa.config.production.ts` | The same storage, database, authentication and language providers; `@genoacms/adapter-gcp/secrets` instead of `secrets-env`; target `gcp` | Storage, Firestore and Secret Manager omit `credentials` (Application Default Credentials: the function's service account). Admin credentials are `secret('GENOACMS_ADMIN_CREDENTIALS')`. The `gcp` target's deploy credential is `inline(serviceAccount)`, which runs on the operator's machine only and never enters the runtime manifest. |

Shared parts (collections, authorization, security, languages) live in modules both files import.

The Vite plugin is active in `vitest` and `vite build`, so both evaluate the dev config. Core's CI
therefore still cannot run either without the credential files, exactly as today. That is the accepted
cost of U7, not a property of the architecture: a config that uses `secret()` loads with no credential
present.

---

## 9. Lifecycle

```
DEVELOPMENT   genoa dev [--config f]            (monorepo: pnpm dev in packages/core)
  cli    root = cwd; spawn `vite dev`, cwd = <core>, GENOA_PROJECT, GENOA_CONFIG
  vite   genoa(): loadConfig(mode = config.mode = 'development') → manifest (with source)
                  virtual:genoa/manifest; watch source.dependencies
         svelte.config.js: resolveKitAdapter() → target's SvelteKit adapter, or none if no targets
  core   host.server.ts: createHost({ manifest, load })          no I/O
         hooks: ensureInstanceInitialized() → host.secrets() (secrets-env) → root seed → default bucket
  edit   config or any file it imports → reload manifest → server.restart()

BUILD         genoa build [target] [--config f] [--no-inline] [--development]
  cli    loadConfig(mode = production, or development with --development) → refuse on any error
         target = arg ?? deployment.default ?? first key
         spawn `vite build`, cwd = <core>, GENOA_PROJECT, GENOA_CONFIG, GENOA_TARGET, GENOA_MODE
  kit    svelte.config.js: descriptor(target) → (await descriptor.svelteKitAdapter()).default(svelteKitOptions + out)
  vite   genoa(): embeds the RuntimeManifest; adapter runtimes stay external (D4)
  cli    write .genoacms/build/package.json (S7.1)

DEPLOY        genoa deploy [target] [--config f]
  cli    run BUILD
         host = createHost({ manifest, load, projectRoot })
         options = host.resolve(target.options, descriptor.secretOptions, `deployment.targets.${target}`)
         (await descriptor.procedure()).default(options, { projectRoot, buildDir, workDir, target })
         host.close()

PRODUCTION    cold start of the artifact
  module eval   createHost(runtime manifest, import)                 no I/O, no cwd, no fs
  bootstrap     host.secrets() → root seed → host.storageForBucket(defaultBucket)
  first use     host.databaseForCollection(c), host.language(l): resolve, then construct
  failure       construction rejects → request 500 → next call retries
```

**Mode** is `GENOA_MODE` (D7), never Vite's `mode`. `genoa build --development` sets it to
`development` and produces a development artifact: its manifest carries `source.root` and it may use `developmentOnly` adapters. Core's
Playwright suite uses this (`build && preview` against the dev store), replacing today's
`deploy --dev`.

`scripts/rotate-root.ts` keeps running under `vite-node` with core's Vite config, so it gets the same
plugin, manifest and host. `genoa rotate-root` spawns it with `GENOA_PROJECT` and `GENOA_CONFIG`,
without `npm explore` and without `GENOA_BUILD`.

---

## 10. Preserved functionality

| Id | Capability today | After |
| :-- | :-- | :-- |
| C1 | Config as a module at the project root, split into files | `genoa.config.ts` or `genoa.config/index.ts`; may import anything that evaluates to data |
| C2 | `GENOA_CONFIG_PATH` override | `--config`, `GENOA_CONFIG` (absolute) |
| C3 | Authentication providers tried in order; `cookieName` | Record in key order; `host.authenticationProviders()`, `host.cookieName` |
| C4 | Databases → provider; collection lookup across databases | `database.databases`; `host.databaseForCollection`, `host.collections` |
| C5 | Buckets → provider; `defaultBucket` | `storage.buckets`; `host.storageForBucket`, `host.defaultBucket`, `host.buckets` |
| C6 | `storage.pathDelimiter` (read by the storage route, undocumented) | Typed, documented, default `'\|->'`; `host.pathDelimiter` |
| C7 | Deployment providers; first is default; `DEPLOYMENT_PROVIDER` override | `deployment.targets`, `default`, first key; `genoa build/deploy [target]` |
| C8 | Exactly one secrets provider | Loader rule 7; `host.secrets()` |
| C9 | Language providers with adapter settings (`target`) | Keyed by language; `host.language()`; typed options |
| C10 | `authorization` as authority, re-read on every resolution | Unchanged stanza and doc comments; `host.authorization` |
| C11 | `security` as policy seeds | Unchanged stanza and doc comments; `host.security` |
| C12 | Collection schema helpers | `@genoacms/contracts/schemas`, unchanged |
| C13 | Per-adapter provider settings | Typed options per descriptor via the registry |
| C14 | `testDocuments` at config root for conformance tests | An argument of the `@genoacms/conformance` suites |
| A1–A6 | Service contracts (storage, database, auth, secrets, deployment, language) | `@genoacms/contracts`, signatures unchanged; deployment reshaped to descriptor + procedure; language stays in `@genoacms/internal` |
| A7 | Per-adapter typing | Registry augmentation |
| A8 | Unused adapters cost nothing | Stronger: construction is lazy per provider, not only loading |
| A9 | Adapter conformance tests | `@genoacms/conformance`, run against a factory, no config file |
| A10 | Every shipped adapter | All ported; AWS goes from non-functional to functional |
| K1 | Bootstrap at module scope, never rejects | Unchanged; `createHost` does no I/O |
| K2 | Secrets on the bootstrap and signing paths | `host.secrets()` directly, outside the resolver cache |
| K3 | `resolveSecretReference` (unused) | Deleted; behavior moves to the resolver, which is actually called |
| K4 | Bucket and collection catalogs for the grant editor | `host.buckets`, `host.collections` |
| K5 | Unit tests mock the config package | Tests mock `$lib/script/host.server` with a host over in-memory runtimes |
| K6 | Root rotation with explicit confirmation | `genoa rotate-root`, same confirmation |
| P1 | `init` scaffolds a project | Writes `genoa.config.ts` (dev) and `genoa.config.production.ts` templates; installs secrets-env |
| P2 | `run` (dev server) | `genoa dev`; `run` kept as an alias |
| P3 | `deploy [provider] [--dev]` | `genoa deploy [target]`; `--dev` becomes `genoa build --development` |
| P4 | `database`: list and delete dynamic collections | Over `host.storageForBucket(host.defaultBucket)`; fixes F8's `config.storage.adapter` |
| P5 | `roles`: offline composition with the catalog from config | Reads `manifest.config` only and never constructs a provider |
| P6 | `rotate-root` | Same command |
| P7 | SvelteKit adapter chosen from the deployment provider | From the target descriptor, with no SDK loaded |
| P8 | GCP deploy (broken today, F15) | Local build, bundle upload, remote dependency install |
| P9 | AWS deploy (non-functional today) | Ported |
| P10 | Node deploy | Copies the artifact; no config bundle |
| P11 | `envDir: false` workaround | No longer needed |
| P12 | Monorepo `pnpm dev` in core | `GENOA_PROJECT` unset → `cwd` (core) is the project |

**Dropped by decision (U5):** `database.defaultDatabase`. It is written in every example config and
read by nothing.

---

## 11. Rejected alternatives

| Alternative | Why rejected |
| :-- | :-- |
| **A generated table of literal `import()`s** (the external proposal's D3) | Under R3, a literal import is bundled by the SvelteKit adapter's rollup pass together with its cloud SDK, because adapter packages are not in core's `dependencies`. The proposal claimed the plugin resolves adapters from the project; its code did not, and resolution was not what mattered. |
| **Remote build on GCP** (today's intent) | It uploads the project source, including the config directory and credentials (F9), and it needs the config and a build script at the remote end. Building locally also lets CI verify exactly what ships. |
| **Runtime `package.json` = core's `dependencies`** | Would install `vite`, `vitest` and the tailwind toolchain on every function. Moving them to `devDependencies` breaks users, who build core from their own install (U6). |
| **Fully self-contained bundle, no install** | Would bundle `typescript`, `ts-morph`, `jsdom` and gRPC SDKs through rollup, which is the most fragile option. |
| **Adapter `validate` inside the runtime module** (external proposal) | Loads SDKs at build time and brings F7 back. Solved by the descriptor split (D2). |
| **`secret.json()` or sniffing a value's first character** | Ambiguous. JSON decoding is declared per option in the descriptor. |
| **Environment overlays in one config file** | The author chose separate files (U1). Composition across files is plain TypeScript imports. |
| **Several secrets providers** | A write would have no defensible target. `env()` covers read-only platform secrets. |
| **Baking resolved secrets into the build** | The artifact would be a credential. `inline()` is the explicit, warned version of this, for operators who accept the trade. |
| **Eager resolution of every provider at cold start** | Pays for providers a request never uses, and makes readiness depend on every key existing. |
| **TTL-based live rotation, reload socket** | Reconstructing live clients under load is a source of bugs, it adds an attack surface, and every target restarts on deploy. Non-goal. |
| **Generic `Config<Extension>` typing** | One type parameter cannot type heterogeneous provider collections (F8). Module augmentation keyed by specifier scales without coupling. |
| **Config as JSON or YAML** | Collection definitions use schema helpers, and configs share modules. "A module that evaluates to data" keeps composition and gets every property of a static format through the manifest. |
| **Three packages (contracts, loader, host)** | No consumer wants the loader without the host's types, or the reverse. Subpath exports keep Vite out of `./host`. |

**Corrections to the external proposal** (for the reviewer's traceability):
- Its F6 ("the bundle is dead") and F2 ("a root import for `PreconditionFailedError`") were factually wrong. See the corrected F6 and F2 above.
- Its P8 described the GCP deploy as uploading the build. It uploads source, and it is broken (F15).
- Its GCP procedure shipped the build without a `package.json` and with a snippet path that would not exist.
- Its `Resolved` type left optional secret fields unresolved, and its `NoSecretRefs` guard accepted `Secret<T>` fields. Both are verified and replaced here.
- It had dev config loading use `ssrLoadModule` before any dev server exists. Replaced by `runnerImport`.
- Its `secrets-env` rewrite let a shell variable hide later writes (S6.6).
- Its minimal config paired a Node production target with the development-only store (S8).
- It said host construction should be memoized without saying the promise, not the instance, is what gets cached (S5.6).
- Its TTL rotation and reload socket are dropped as non-goals.

---

## 12. Open questions

| # | Question | Recommendation |
| :-- | :-- | :-- |
None. Q1 to Q3 are recorded as U5 to U8, and Q4 as U9.

---

## 13. Verification before any RFC is written

Each item is an assumption the design depends on. Per the discovery rule, a failure changes this
document before any RFC exists. Run on 2026-09-26 with Node 24.21, Vite 7.3.6, SvelteKit 2.70.2,
`@sveltejs/adapter-node` 5.5.7, the repository's cloud-run SvelteKit adapter, pnpm 10.6 and npm 11.19.

**Method.** Spikes S-1 to S-5 used a fake installed core (`@spike/core`: the same SvelteKit setup,
`dependencies` shaped like the real core's including `vite`) in a separate project. That project
depended on a fake adapter package with a descriptor module and a runtime module, and the runtime
imported a fake SDK carrying a marker string. Two providers were configured on that one adapter.
S-6 used a real build of `packages/core` at `9592593`. No repository file was changed.

| Spike | Assumption | Result |
| :-- | :-- | :-- |
| S-1 | A runtime-string `import(/* @vite-ignore */ s)` in core survives `vite build` and both SvelteKit adapters' rollup passes, and resolves from `<artifact>/node_modules` after install. | **Pass.** The SDK marker is absent from both outputs, and the loader is emitted verbatim. After `npm install` of the generated `package.json` into an empty directory, both artifacts served the route. Two providers on one adapter produced two instances (`instance: 1`, `instance: 2`). |
| S-2 | `runnerImport` loads a TypeScript config with imports, from a script, from `svelte.config.js` and from a Vite plugin. | **Pass, with two corrections.** TypeScript, JSON (`with { type: 'json' }`), `.js` credential modules and nested imports all load in 66–80 ms. A type-only adapter import is erased and loads nothing. `dependencies` is transitive but **excludes the config file itself**. The plugin's `configResolved` fires eight times per SvelteKit build, **with inconsistent `mode`**. That led to `GENOA_MODE` (D7) and loader memoization (S5.5 rule 1). |
| S-3 | An absolute `out` outside core works for both SvelteKit adapters. | **Pass** for adapter-node and cloud-run-functions. SvelteKit still writes `.svelte-kit/` inside core, and Vite writes `node_modules/.vite-temp/` there when bundling `vite.config`. Both are new files inside the installed package, and both worked inside the pnpm virtual store. |
| S-4 | A Cloud Run function runs from `build/` plus a generated `package.json` with `"main": "function.js"`. | **Local pass; live deploy not run.** `npm install` of the generated file followed by Google's Functions Framework 3 (`--target=genoacms`) served the route. Buildpacks and the real platform are untested. That needs a deploy to a GCP project, and the author has to authorize it. |
| S-5 | In a pnpm project, core resolves the project's adapter packages in Vite dev and in the build. | **Pass**, both with default hoisting and with `hoist: false`. **Found a design flaw on the way:** importing `@sveltejs/adapter-node` by name from core fails under `hoist: false` (`ERR_MODULE_NOT_FOUND`), because it is a dependency of the deployment adapter package, not of core or the project. Loading it through a function in the descriptor works in both layouts. That led to the `DeploymentDescriptor` change (S5.4). |
| S-6 | A bare-specifier scan of the server output finds every external. | **Pass** on real core: 12 externals, no `require`/`createRequire`, and only known non-literal imports (S7.1). The generated `package.json` installs cleanly (126 packages, 67 MB). **Partial:** real core was not booted from the installed artifact, because today's core reads its config from `cwd` at runtime, which this design replaces. The boot-and-exercise check moves into the deploy RFC's verification. |
| S-7 | Descriptors and deploy-time modules load **from the project root** even when the loading code lives in another package, as `@genoacms/config` and the CLI do in the monorepo. | **Pass with `import-meta-resolve`**, under strict pnpm, from an unrelated directory: descriptor, the SvelteKit adapter through the descriptor's loader, and the adapter runtime. **`runnerImport` was rejected for this:** it resolves from `root` correctly but closes its module runner afterwards, so a descriptor's lazy `import()` then fails with "Vite module runner has been closed". |

**S-4 live deploy: skipped by decision (U10).** It is verified once `genoa.config.production.ts` exists, as a
verification step of the GCP deployment RFC.

---

## 14. RFCs

The implementation specifications are in [`docs/rfcs/`](../rfcs/README.md): 17 RFCs in dependency
order, each with exact files, contracts, non-goals and verification commands.

- Adapters are ported next to their old modules (RFC-0006 to RFC-0013).
- RFC-0014 flips every package's `exports` and switches core in one commit, so every intermediate commit stays green.

Findings made while writing the RFCs were folded back into this document:
- `LanguageAdapter` stays in `internal` (§5.1);
- project-rooted descriptor loading, spike S-7 (§5.5);
- `inline()` under deployment targets does not warn (§6.2);
- U11, the one-time move of core's dev store.

---

## Critique & architectural sanity check

**Pros**
- The cycle, path inference, config bundling and SDK loading at build time are removed by construction rather than by convention. A build never constructs a client or resolves a secret.
- The runtime `package.json` is derived from the bundle, so functions install what the server loads and nothing else, while core keeps the build tooling users need (U6).
- Two instances of one adapter work, because identity is the provider key and no module-level state exists.
- The bootstrap rule and the credential fields are enforced three times (types, descriptor, loader), and `tsc` checks the type half.
- The GCP deploy stops uploading source and credentials, and the artifact can be built and inspected locally before it ships.
- Adapters depend on `contracts` alone. A third-party adapter needs no knowledge of the loader.

**Cons & trade-offs**
- Two modules per adapter service (descriptor and runtime), plus a registry augmentation. More files for adapter authors.
- Every target must install dependencies. Deploys from the monorepo need published packages (S7.1).
- The config is loaded three times per build (CLI, `svelte.config.js`, Vite plugin). It is cheap because it is data, but it is three evaluations of user code.
- The first use of each provider costs a secret round trip on cold start, unless `env()` or ADC is used.
- Core's own CI still cannot build or run unit tests, because core's dev config imports gitignored credential files (U7). The architecture allows a credential-free build; this repository's config opts out of it.
- `runnerImport` is experimental in Vite 7. A breaking change there hits the loader. It is isolated behind `loadConfig`, so a fallback such as `jiti` is a one-module swap.

**Blindspots & missed edge cases**
- **The bundle scan sees only ESM `import` syntax.** A `require()` left dynamic by rollup's CommonJS plugin, a `createRequire` call, or a non-literal `import()` inside a bundled dependency loads a package the scan cannot find. The failure is `ERR_MODULE_NOT_FOUND` at runtime, not at build. S-6 has to prove the set is complete for today's code, and a later dependency can quietly break it again. A smoke test that installs the generated `package.json` into an empty directory and boots the server belongs in the deploy RFC's verification.
- **Generated `package.json` without a lockfile.** Transitive versions are resolved at install time, so two deploys of one build can differ. A generated lockfile is possible but not designed here.
- **Adapter resolution relies on Node walk-up from core.** S-5 showed it holds under npm, under pnpm's default hoisting and under `hoist: false`, for packages the project depends on *directly*. It does not hold for transitive packages, which is why the SvelteKit adapter is loaded through the descriptor. Any future bare-name import from core of something the project does not list directly will fail the same way under strict pnpm. Yarn PnP and a linked core are untested; linked core is a declared non-goal.
- **Writes inside the installed core package.** `.svelte-kit/` and `node_modules/.vite-temp/` are created inside core, and in pnpm that means inside the virtual store. It worked in S-3 and S-5, but a read-only store (a Nix-style or container-baked `node_modules`) would fail the build.
- **Spike fidelity.** S-1 to S-5 used a fake core with the real toolchain, not the real core. A leftover `node_modules` symlink once masked the S-5 failure until it was removed and the spike rerun. The RFCs' verification must repeat S-1 and S-5 against the real packages.
- **Third-party SvelteKit adapters that trace dependencies** (for example Vercel's nft) may treat a non-analyzable `import()` differently from rollup externals. D4 is verified only for the two adapters in the repository.
- **Integer-like provider keys** silently reorder authentication trials. Loader rule 9 catches this, but only if that rule is implemented.
- **Secrets used by several providers** are fetched once, thanks to the per-key cache, but a timeout fails every provider waiting on that key at the same moment. That is acceptable, but it looks like correlated failures in logs.
- **`authentication-adapter-array` credentials** become a JSON secret with plain-text passwords. Moving them out of the config is an improvement, but they remain plain text in the store (S3 non-goal).
