---
type: architecture
title: The adapter model
codes: []
verified: 7174f7f
conforms: false
---

# The adapter model

Part of the configuration architecture, split out of [`configuration.md`](../configuration.md) on 2026-10-02 without changing its content. Unprefixed IDs (`U`, `D`, `F`, `R`, `S-`, `C`, `A`, `K`, `P`) are those of the 2026-09 redesign. `configuration.md` lists which document holds each.

What an adapter is, as `@genoacms/contracts` types it: a descriptor and a runtime per service, the
references that fill credential options, the registries that type each provider entry, and the
packages and their dependency direction. What each service's instance must do is in the service's
own contract document ([`README.md`](README.md)).

## Decisions

| # | Decision | Consequence |
| :-- | :-- | :-- |
| U4 | Package names: `@genoacms/contracts` and `@genoacms/config`. | `@genoacms/cloudabstraction` is deleted (*Packages and dependency direction*). |

**D2. Adapters are two modules: a descriptor and a runtime.** The *descriptor* is SDK-free. It declares
the service kind, which options are secrets, whether the adapter is development-only, an option
validator, and the bare specifier of its runtime module. The *runtime* exports a factory
`create(resolvedOptions, ctx)`. The config names the descriptor.
*Why:* the loader and the build can validate every provider, and choose a SvelteKit adapter, without
loading a single SDK. That is D1 applied to adapters. The external proposal ran validators inside the
adapter module, which brought F7 back.
*Cost:* an adapter ships two entry points per service.

**D4. Adapter runtimes are loaded by bare specifier at runtime, not bundled.** The host's loader is a
dynamic `import()` whose argument rollup cannot analyze. Adapter packages therefore stay external in
every SvelteKit adapter's output (R3), and the build emits a `package.json` naming them next to core's
own externals (D6).
*Why:* bundling cloud SDKs through a SvelteKit adapter's rollup pass is fragile (for example, gRPC
clients loading proto files by path) and outside our control for third-party SvelteKit adapters.
*Cost:* the deployment must install dependencies. Every target already has to, for core's own
externals.

## Packages and dependency direction

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

## Module graph after

```
genoa.config/development.ts ──imports──▶ ./collections.ts, @genoacms/config (helpers), adapter types (type-only)
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

## Types: references and the registry (`@genoacms/contracts`)

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

## Types: adapters (`@genoacms/contracts`)

```ts
type SecretEncoding = 'string' | 'json'

/** SDK-free. The module at the specifier the config names. */
interface AdapterDescriptor<Kind extends string, O extends object> {
  readonly kind: Kind
  /** Bare specifier of the runtime module, e.g. '@genoacms/adapter-gcp/storage/runtime'. Never relative. */
  readonly runtime: string
  /** Top-level options that hold references, with how to decode them. References anywhere else are refused. */
  readonly secretOptions?: { readonly [K in keyof O]?: SecretEncoding }
  /** Refused by a production build (secrets.md: Development store). */
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
  /** Absolute path of the build artifact (build.md: The artifact). */
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

## Non-goals

- Linking `@genoacms/core` from outside the project (`link:` or `file:` pointing elsewhere). Adapter resolution relies on standard walk-up from the installed core (*Types: adapters*).

## Rejected alternatives

| Alternative | Why rejected |
| :-- | :-- |
| **A generated table of literal `import()`s** (the external proposal's D3) | Under R3, a literal import is bundled by the SvelteKit adapter's rollup pass together with its cloud SDK, because adapter packages are not in core's `dependencies`. The proposal claimed the plugin resolves adapters from the project; its code did not, and resolution was not what mattered. |
| **Adapter `validate` inside the runtime module** (external proposal) | Loads SDKs at build time and brings F7 back. Solved by the descriptor split (D2). |
| **Generic `Config<Extension>` typing** | One type parameter cannot type heterogeneous provider collections (F8). Module augmentation keyed by specifier scales without coupling. |
| **Three packages (contracts, loader, host)** | No consumer wants the loader without the host's types, or the reverse. Subpath exports keep Vite out of `./host`. |
