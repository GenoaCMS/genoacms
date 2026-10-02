---
type: architecture
title: Configuration architecture
conforms: false
---

# Configuration architecture

| | |
| :-- | :-- |
| Tier | 1 (architecture). RFCs are derived from this document after it is approved. |
| Status | Draft for review |
| Date | 2026-09-26; split 2026-10-02 |
| Scope | `genoa.config`: authoring, the manifest, the loader, one config file per environment; and the record of the 2026-09 redesign |
| Verified against | `main` at `9592593` |
| Related | [`contracts/`](contracts/README.md): the adapter model and the service contracts; [`host.md`](host.md); [`secrets.md`](secrets.md); [`build.md`](build.md); [`cli.md`](cli.md): the `genoa` command; [`adapter-gcp/`](adapter-gcp/README.md) and [`adapter-aws/`](adapter-aws/README.md): what is specific to each cloud |

This document replaces the external proposal `genoacms-config-architecture.md` (2026-09-10). It keeps
that proposal's core decisions and corrects the parts that did not match the repository or did not
type-check. *Rejected alternatives* lists what changed and why.

Nothing is released, so there is no migration: every shape below replaces its predecessor outright.

## Where the rest went

On 2026-10-02 this document was split by subject, without changing the content that moved. Each
moved ID keeps a pointer in its old place.

| Content | Now in |
| :-- | :-- |
| Packages and their dependency direction, module graph, reference types, registries, descriptors and runtimes (U4, D2, D4) | [`contracts/adapter-model.md`](contracts/adapter-model.md) |
| The service contracts, starting with authentication (U14, F20, Q5, Q6) | [`contracts/`](contracts/README.md) |
| The host and provider construction (D3) | [`host.md`](host.md) |
| Secret references, resolution, bootstrap, the development store (U3, U11, D5) | [`secrets.md`](secrets.md) |
| The artifact, vendoring, targets, the lifecycle (U2, U6, U10, D6 to D9) | [`build.md`](build.md) |
| The CLI's commands, flags and messages (since 2026-10-02, before this split) | [`cli.md`](cli.md) |
| Authentication on GCP, and self-owned identity stores (U13) | [`adapter-gcp/authentication-identity-platform.md`](adapter-gcp/authentication-identity-platform.md), [`identities.md`](identities.md) |
| Everything else: the config, the manifest and the loader (D1), the reality before the redesign (F1 to F19, R1 to R8), goals, preserved functionality (C, A, K, P), spikes (S-1 to S-8), the RFC list | here |

## Decisions already made by the author

| # | Decision | Consequence |
| :-- | :-- | :-- |
| U1 | Development and production use **separate config files**, selected explicitly. | No profile or overlay mechanism inside one file (*Config files per environment*). |
| U2 | *Moved* to [`build.md`](build.md). | |
| U3 | *Moved* to [`secrets.md`](secrets.md). | |
| U4 | *Moved* to [`contracts/adapter-model.md`](contracts/adapter-model.md). | |
| U5 | `database.defaultDatabase` is history. | Dropped (*Preserved functionality*). |
| U6 | *Moved* to [`build.md`](build.md). | |
| U7 | Core's development config keeps today's providers and today's credential files, imported and wrapped in `inline()`. | Core's own CI still cannot load core's dev config (*Config files per environment*). A config that uses `secret()` or `env()` builds with no credential present. |
| U8 | GCP deployment of core moves to a separate production config. | `packages/core/genoa.config/production.ts` (*Config files per environment*, U12). |
| U9 | `--config` is optional on every command, `genoa deploy` included. | Without it, the default lookup applies (*Types: the config and the manifest*). A development config chosen by mistake for a production build fails the `developmentOnly` check (*Config files per environment*). |
| U10 | *Moved* to [`build.md`](build.md). | |
| U11 | *Moved* to [`secrets.md`](secrets.md). | |
| U12 | A project's configuration lives in **one place**: a single root file `genoa.config.ts`, or one directory `genoa.config/` holding every config file, the modules they share and local credential files. In the directory form the files are named after their environment: `development.ts` and `production.ts`. | Default lookup: `genoa.config.{ts,mts,js,mjs}`, then `genoa.config/development.{ts,mts,js,mjs}` (*Types: the config and the manifest*). `genoa.config/index.*` is not looked up. A production config is always named explicitly, `--config genoa.config/production.ts` (U1, U9). Core and `genoa init` use the directory form (*Config files per environment*). *Cost:* `genoa.config/index.ts` is no longer a config; two layouts stay supported, and the docs teach the directory; the symmetric names suggest a mode-based default that does not exist. When both forms exist the root file wins silently, and no `config/ambiguous` error is specified. Any `genoa.config/development.ts` is read as the config. The U9 guard works only when the development config holds a `developmentOnly` adapter. Core's `.npmignore` covers `/genoa.config`, so anything moved out of it must be listed again. |
| U13 | *Moved* to [`adapter-gcp/README.md`](adapter-gcp/README.md) GU1 (Identity Platform) and [`identities.md`](identities.md) IU1 (self-owned stores), 2026-10-02. | |
| U14 | *Moved* to [`contracts/authentication.md`](contracts/authentication.md) CU2. | |

## Reality: the system before the redesign

Every statement here was checked against the source. Paths are relative to `packages/`.

### Module graph before the redesign

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

### Findings

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
| F18 | **Every build runs the instance's startup I/O.** SvelteKit runs the built server to analyse it, which evaluates `hooks.server.ts` and every route's server modules. Two of core's modules do provider I/O at module scope. The first is the instance bootstrap (`await ensureInstanceInitialized()`): signing keys, manifests, the security policy. The second is the dynamic-collection listing, which also creates `.genoacms/collections` when it is missing. So every `vite build` resolves secrets and reads and writes the configured storage. With inline credentials this succeeds without anyone noticing, and the old Cloud Build flow bootstrapped the production instance from inside the build. Without credentials, as in a production config that relies on ADC, the build crashes. Found while verifying RFC-0015. | `hooks.server.ts:11`, `database/database.server.ts:13` |
| F19 | **The runtime `package.json` names versions the registry does not have, or has with different code.** It pins each package to its installed version ([`build.md`](build.md) *The artifact*), and the platform installs from npm. From the monorepo, `@genoacms/language-adapter-ts@0.1.0` and `@genoacms/contracts` are unpublished, so the install fails. `@genoacms/adapter-gcp@0.8.2-1` is published, but from before the descriptor/runtime split: it has no `./secrets` or `./*/runtime` exports, so the install succeeds and the runtime cannot load. Nothing detects the second case. A user's own adapter, kept in their repository and never published, fails the same way. Found preparing the first production deploy. | `config/src/artifact/index.ts`, `versions.ts` |
| F20 | *Moved* to [`contracts/authentication.md`](contracts/authentication.md) CF1. | |

### Constraints the design must respect

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

## Goals and non-goals

### Goals (not negotiable)

1. Any platform through an adapter: first-party (GCP including Identity Platform and Firestore authentication, AWS, MinIO, Postgres, Node, env secrets, array auth, TypeScript language) and third-party.
2. Several providers serving one service at once, **including two instances of the same adapter**.
3. The full service set: `authentication`, `database`, `storage`, `deployment`, `secrets`, `languages`. Plus `authorization`, `security` and collection definitions.
4. Deployment targets that choose a SvelteKit adapter at build time and run a deploy procedure.
5. Credentials can live in a secret manager. A reference is resolved at runtime and is never baked into the build.
6. `vite build` constructs no client and resolves no secret, including while SvelteKit runs the app to analyse it (D8, F18). A config that uses only `secret()` and `env()` builds with no credential present. Core's own dev config imports credential files by choice (U7), so it still needs them to load.
7. All current functionality preserved (*Preserved functionality*).

### Non-goals

- Hot-applying config changes in dev without restarting the server.
- A credential-free CI build of core itself (U7).

The non-goals of the other subjects moved with them: secrets to [`secrets.md`](secrets.md), the build
to [`build.md`](build.md), adapter resolution to [`contracts/adapter-model.md`](contracts/adapter-model.md),
and authentication to [`contracts/authentication.md`](contracts/authentication.md).

## Decisions

**D1. The config is data.** A config file is a module that must **evaluate to** a plain,
JSON-serializable object. It may import helpers and collection files. It may not import adapters,
and it may not contain credential values except through `inline()`. The loader evaluates it on a
developer machine or CI runner and produces a **manifest**. Every later phase reads the manifest,
never the module.
*Why:* removes the cycle (F2), the bundling step (F6) and SDK loading at build time (F7).
*Cost:* the config cannot compute anything at runtime. Nothing needs to today. It is evaluated three
times per build (the CLI, `svelte.config.js`, the Vite plugin): cheap because it is data, but three
evaluations of user code. `runnerImport` is experimental in Vite 7, so a breaking change there hits
the loader; it is isolated behind `loadConfig`, and a fallback such as `jiti` is a one-module swap.

**D2.** *Moved* to [`contracts/adapter-model.md`](contracts/adapter-model.md).

**D3.** *Moved* to [`host.md`](host.md).

**D4.** *Moved* to [`contracts/adapter-model.md`](contracts/adapter-model.md).

**D5.** *Moved* to [`secrets.md`](secrets.md).

**D6.** *Moved* to [`build.md`](build.md).

**D7.** *Moved* to [`build.md`](build.md).

**D8.** *Moved* to [`build.md`](build.md).

**D9.** *Moved* to [`build.md`](build.md).

## Types: the config and the manifest (`@genoacms/config`)

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

**Default lookup** under `root` (U12): `genoa.config.{ts,mts,js,mjs}`, then `genoa.config/development.{ts,mts,js,mjs}`.
The root file wins when both forms exist. The lookup never finds a production config:
`genoa.config/production.ts` is always named with `--config` or `GENOA_CONFIG`.

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

## Config files per environment

A project holds one config file per environment, all in one directory, `genoa.config/` (U12). Shared
parts are ordinary TypeScript modules beside them:

```
genoa.config/
  development.ts                development: secrets-env, local storage/database, target `local`
  production.ts                 production: Secret Manager (ADC), cloud providers, target `gcp`
  collections.ts                shared
  authorization.ts              shared roles and assignments
```

A project with a single config may use one root file, `genoa.config.ts`, instead.

Every CLI command accepts `--config <file>`, which defaults to the lookup in *Types: the config and the manifest*. Choosing the wrong
file for a production build is caught at build time, because the dev config's secrets store is
`developmentOnly`. `GENOA_CONFIG_PATH` is removed. Its two users, the test fixtures in
`language-adapter-ts` and `sdk`, construct their adapter directly and no longer need a config.

**Core's own configs** (U7, U8):

| File | Providers | Credentials |
| :-- | :-- | :-- |
| `packages/core/genoa.config/development.ts` | Today's set: GCS (`FIM-gcs`), Firestore, `secrets-env`, `authentication-adapter-array`, `language-adapter-ts`; target `local` (`adapter-node`) | Today's gitignored files, imported and wrapped: `inline(serviceAccount)` and `inline(authCredentials)`, imported from where they are now, beside the config (`genoa.config/gcp/serviceAccount.json`, `genoa.config/gcp/authCredentials.js`). `genoa.config/index.js` and `genoa.config/gcp/index.js` are removed, so the default lookup finds `genoa.config/development.ts`. Development mode does not warn. |
| `packages/core/genoa.config/production.ts` | The same storage, database and language providers; `@genoacms/adapter-gcp/secrets` instead of `secrets-env`; `@genoacms/adapter-gcp/authentication/identity-platform` (U13, `adapter-gcp/authentication-identity-platform.md` GD2) or `@genoacms/adapter-gcp/authentication/firestore` (`adapter-gcp/authentication-firestore.md` GD9) instead of the array adapter, once one is implemented; until then the array adapter with a JSON secret; target `gcp` | Storage, Firestore, Secret Manager and Identity Platform omit `credentials` (Application Default Credentials: the function's service account). No user credential is configured: users live in Identity Platform or the Firestore identity store. If `adapter-gcp/authentication-identity-platform.md` GS1a requires an API key, it is `secret('GENOACMS_IDENTITY_API_KEY')`. The `gcp` target's deploy credential is `inline(serviceAccount)`, which runs on the operator's machine only and never enters the runtime manifest. |

Shared parts (collections, authorization, security, languages) live in modules beside them in
`genoa.config/`, which both files import.

The Vite plugin is active in `vitest` and `vite build`, so both evaluate the dev config. Core's CI
therefore still cannot run either without the credential files, exactly as today. That is the accepted
cost of U7, not a property of the architecture: a config that uses `secret()` loads with no credential
present.

## Preserved functionality

| Id | Capability today | After |
| :-- | :-- | :-- |
| C1 | Config as a module at the project root, split into files | `genoa.config.ts`, or the `genoa.config/` directory with `development.ts` as its default entry (U12); may import anything that evaluates to data |
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
| K1 | Bootstrap at module scope, never rejects | Unchanged at runtime; `createHost` does no I/O; skipped while SvelteKit analyses the build (D8) |
| K2 | Secrets on the bootstrap and signing paths | `host.secrets()` directly, outside the resolver cache |
| K3 | `resolveSecretReference` (unused) | Deleted; behavior moves to the resolver, which is actually called |
| K4 | Bucket and collection catalogs for the grant editor | `host.buckets`, `host.collections` |
| K5 | Unit tests mock the config package | Tests mock `$lib/script/host.server` with a host over in-memory runtimes |
| K6 | Root rotation with explicit confirmation | `genoa rotate-root`, same confirmation |
| P1 | `init` scaffolds a project | Scaffolds `genoa.config/`: `development.ts` and `production.ts`, plus the shared `collections.ts`, `authorization.ts`, `security.ts` and `languages.ts` both import; installs secrets-env and language-adapter-ts. *Cost:* six files where a small project needs one, and `buckets` and `databases` repeated per environment. Re-running `init`, `TODO` specifiers and the `@genoacms/contracts` install: [`cli.md`](cli.md) CLI-12, CLI-13 |
| P2 | `run` (dev server) | `genoa dev`; `run` kept as an alias |
| P3 | `deploy [provider] [--dev]` | `genoa deploy [target]`; `--dev` becomes `genoa build --mode development` (RFC-0015; `cli.md`) |
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

## Rejected alternatives

| Alternative | Why rejected |
| :-- | :-- |
| **Environment overlays in one config file** | The author chose separate files (U1). Composition across files is plain TypeScript imports. |
| **Config as JSON or YAML** | Collection definitions use schema helpers, and configs share modules. "A module that evaluates to data" keeps composition and gets every property of a static format through the manifest. |

The other rejected alternatives moved with their subjects.

**Corrections to the external proposal** (for the reviewer's traceability):
- Its F6 ("the bundle is dead") and F2 ("a root import for `PreconditionFailedError`") were factually wrong. See the corrected F6 and F2 above.
- Its P8 described the GCP deploy as uploading the build. It uploads source, and it is broken (F15).
- Its GCP procedure shipped the build without a `package.json` and with a snippet path that would not exist.
- Its `Resolved` type left optional secret fields unresolved, and its `NoSecretRefs` guard accepted `Secret<T>` fields. Both are verified and replaced here.
- It had dev config loading use `ssrLoadModule` before any dev server exists. Replaced by `runnerImport`.
- Its `secrets-env` rewrite let a shell variable hide later writes ([`secrets.md`](secrets.md) *Development store*).
- Its minimal config paired a Node production target with the development-only store (*Config files per environment*).
- It said host construction should be memoized without saying the promise, not the instance, is what gets cached ([`host.md`](host.md) *Types: the host*).
- Its TTL rotation and reload socket are dropped as non-goals.

## Open questions

Q1 to Q3 are recorded as U5 to U8, and Q4 as U9. Q5 and Q6 moved to
[`contracts/authentication.md`](contracts/authentication.md), as CQ1 and CQ2.

## Verification before any RFC was written

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
| S-2 | `runnerImport` loads a TypeScript config with imports, from a script, from `svelte.config.js` and from a Vite plugin. | **Pass, with two corrections.** TypeScript, JSON (`with { type: 'json' }`), `.js` credential modules and nested imports all load in 66–80 ms. A type-only adapter import is erased and loads nothing. `dependencies` is transitive but **excludes the config file itself**. The plugin's `configResolved` fires eight times per SvelteKit build, **with inconsistent `mode`**. That led to `GENOA_MODE` (D7) and loader memoization (*Types: the config and the manifest* rule 1). |
| S-3 | An absolute `out` outside core works for both SvelteKit adapters. | **Pass** for adapter-node and cloud-run-functions. SvelteKit still writes `.svelte-kit/` inside core, and Vite writes `node_modules/.vite-temp/` there when bundling `vite.config`. Both are new files inside the installed package, and both worked inside the pnpm virtual store. |
| S-4 | A Cloud Run function runs from `build/` plus a generated `package.json` with `"main": "function.js"`. | **Local pass; live deploy not run.** `npm install` of the generated file followed by Google's Functions Framework 3 (`--target=genoacms`) served the route. Buildpacks and the real platform are untested. That needs a deploy to a GCP project, and the author has to authorize it. |
| S-5 | In a pnpm project, core resolves the project's adapter packages in Vite dev and in the build. | **Pass**, both with default hoisting and with `hoist: false`. **Found a design flaw on the way:** importing `@sveltejs/adapter-node` by name from core fails under `hoist: false` (`ERR_MODULE_NOT_FOUND`), because it is a dependency of the deployment adapter package, not of core or the project. Loading it through a function in the descriptor works in both layouts. That led to the `DeploymentDescriptor` change ([`contracts/adapter-model.md`](contracts/adapter-model.md) *Types: adapters*). |
| S-6 | A bare-specifier scan of the server output finds every external. | **Pass** on real core: 12 externals, no `require`/`createRequire`, and only known non-literal imports ([`build.md`](build.md) *The artifact*). The generated `package.json` installs cleanly (126 packages, 67 MB). **Partial:** real core was not booted from the installed artifact, because today's core reads its config from `cwd` at runtime, which this design replaces. The boot-and-exercise check moves into the deploy RFC's verification. |
| S-7 | Descriptors and deploy-time modules load **from the project root** even when the loading code lives in another package, as `@genoacms/config` and the CLI do in the monorepo. | **Pass with `import-meta-resolve`**, under strict pnpm, from an unrelated directory: descriptor, the SvelteKit adapter through the descriptor's loader, and the adapter runtime. **`runnerImport` was rejected for this:** it resolves from `root` correctly but closes its module runner afterwards, so a descriptor's lazy `import()` then fails with "Vite module runner has been closed". |

**S-8, run on 2026-09-27 for D9 (F19).** Artifact: the real production build of `packages/core`
(`genoa build gcp --config genoa.config/production.ts` at `15bcbd5`). The six `@genoacms/*` runtime
packages (`adapter-gcp`, `authentication-adapter-array`, `language-adapter-ts`, `contracts`,
`internal`, `sveltekit-adapter-cloud-run-functions`) were packed and each artifact was installed with
`npm install --omit=dev` into an empty directory. "Pass" means: every `@genoacms/*` entry in
`package-lock.json` resolves to `file:vendor/…`, each package is installed once, and all five runtime
specifiers import.

| Case | Result |
| :-- | :-- |
| A: `pnpm pack` (rewrites `workspace:^` to ranges), `file:` in `dependencies` plus `overrides` | **Pass**, npm 11.19. `adapter-gcp@0.8.2-1` is the local build, with `./secrets/runtime`, although the registry has a different package under that version. |
| A′: as A, without `overrides` | **Fail:** `E404 @genoacms/contracts@^0.0.1`. Nested dependencies ignore the root's `file:` entries. |
| B: `npm pack --ignore-scripts` (keeps `workspace:^` in the tarball), plus `overrides` | **Pass** with npm 11.19, 10.9.2 and 9.9.4. `overrides` replaces `workspace:^` before npm parses it. |
| B′: as B, without `overrides` | **Fail:** `EUNSUPPORTEDPROTOCOL workspace:^`. |
| Locality by real path | pnpm workspace package: outside `node_modules` (local). npm `file:` directory: symlink, local. **yarn v1 `file:` directory: copied into `node_modules`, indistinguishable from a registry install.** Registry packages under pnpm and npm: inside `node_modules`. |
| `esbuild` native binary after install | Works on the same platform, although npm 11 reports its `postinstall` as not covered by `allowScripts`. The binary comes from the optional platform package. |

S-1 to S-5 used a fake core with the real toolchain. A leftover `node_modules` symlink once masked
the S-5 failure until it was removed and the spike rerun.

B is the design, because npm is the one packer every user has. The yarn v1 row is why adapters are
vendored unconditionally (D9).

**S-4 live deploy: skipped by decision (U10)** until `genoa.config/production.ts` existed. Since run:
the author deployed core to GCP on 2026-09-28 and it serves (`adapter-gcp/README.md` §5).

## RFCs

The implementation specifications are in [`docs/rfcs/`](../rfcs/README.md): 17 RFCs in dependency
order, each with exact files, contracts, non-goals and verification commands.

- Adapters are ported next to their old modules (RFC-0006 to RFC-0013).
- RFC-0014 flips every package's `exports` and switches core in one commit, so every intermediate commit stays green.
- RFC-0018 applies U12 to the loader and to core. It was written after RFC-0014 was implemented, and is implemented before RFC-0015.
- RFC-0020 implements D9 (vendoring). It was written after RFC-0015 was implemented, when the first production deploy hit F19.

Findings made while writing the RFCs were folded back into this document:
- `LanguageAdapter` stays in `internal` ([`contracts/adapter-model.md`](contracts/adapter-model.md) *Packages and dependency direction*);
- project-rooted descriptor loading, spike S-7 (*Types: the config and the manifest*);
- `inline()` under deployment targets does not warn ([`secrets.md`](secrets.md) *`inline()`*);
- U11, the one-time move of core's dev store.
