---
type: architecture
title: Build, artifact and deployment
conforms: false
---

# Build, artifact and deployment

Part of the configuration architecture, split out of [`configuration.md`](configuration.md) on 2026-10-02 without changing its content. Unprefixed IDs (`U`, `D`, `F`, `R`, `S-`, `C`, `A`, `K`, `P`) are those of the 2026-09 redesign. `configuration.md` lists which document holds each.

What `genoa build` and `genoa deploy` do: the processes and the facts that cross between them, the
self-contained artifact and its generated `package.json`, vendored local packages, the deployment
targets, and the lifecycle of a project from development to a production cold start.

## Decisions

| # | Decision | Consequence |
| :-- | :-- | :-- |
| U2 | GCP does not have to build remotely. **Build locally, ship the bundle**, still without uploading `node_modules`. | Build output carries a generated `package.json` of runtime dependencies; the platform installs them (*The artifact*). |
| U6 | Core's `dependencies` stay as they are: `vite` and the build tooling are genuinely needed where core is installed as a package and built by the user. | The runtime `package.json` is derived from what the server bundle imports, not from core's `dependencies` (*The artifact*). |
| U10 | The live GCP spike (S-4) is skipped until the production config exists. That config uses `@genoacms/adapter-gcp/secrets`. | The first real GCP deploy is part of the GCP deployment RFC's verification ([`configuration.md`](configuration.md) *Verification before any RFC was written*). |

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
calls reported `production` (S-2 result, [`configuration.md`](configuration.md) *Verification before any RFC was written*). SvelteKit runs extra internal Vite builds and resolves
the Vite config while loading its own config. When `GENOA_MODE` is unset (monorepo `pnpm dev` or
`pnpm build`), the plugin falls back to `development` for `vite dev` and `production` for `vite build`.
That fallback depends only on `command`, which was consistent across every call.

**D8. No provider is constructed while SvelteKit analyses the build (F18).** Core reads `building`
from `$app/environment`, which SvelteKit sets exactly while it runs the app during `vite build`. It
is enforced twice:
- **At each module-scope call:** the bootstrap and the collection listing skip their I/O while `building`. The listing reads as empty.
- **In core's host loader:** `host.server.ts` refuses to load any adapter runtime while `building` (`host/building`). A future module-scope call therefore fails the build loudly instead of quietly reaching a live instance.

*Why:* goal 6 was an assumption about Vite, and SvelteKit's analysis step broke it. Any server-side
code that runs at import time runs during the build. The guard reads a flag that SvelteKit defines for
exactly this purpose, rather than inferring build time from the environment.
*Cost:* two call sites must remember the flag. The loader check turns forgetting it into a build
failure, not a silent write.

**D9. Local packages travel inside the artifact (F19).** `createRuntimePackage` packs some packages
with `npm pack` into `<buildDir>/vendor/`. The runtime `package.json` points each of them at its
tarball, in `dependencies` and in `overrides`. Two rules decide what is vendored:
- **Every runtime adapter package named in the manifest**, however it was installed. Adapters are the packages users write themselves, and the one install layout that hides where a package came from (yarn v1 copies `file:` dependencies into `node_modules`) cannot be detected (S-8).
- **Every other package, transitively from a vendored one, that is local:** its installed directory's real path has no `node_modules` segment. That covers pnpm, npm and yarn workspaces, and `file:`/`link:` directory dependencies under npm and pnpm.

Everything else installs from the registry as before. Packing uses npm, which ships with Node, so it
works in npm, pnpm and yarn (node-modules linker) projects. The artifact is always installed with npm
9 or later: Cloud Run buildpacks and the AWS procedure already do so, and the Node target documents it.

*Why:* the artifact then installs exactly the adapter code that was loaded and tested on the
developer's machine, published or not, and a version collision with the registry (F19) cannot occur.
A user can deploy an adapter that exists only in their repository.
*Cost:* the build needs `npm` on `PATH` and runs it once per vendored package. Vendored packages lose
registry provenance, and their own dependencies still resolve by range, as all transitive
dependencies already do.

## The artifact

```
<project>/.genoacms/
  build/                    SvelteKit adapter output (adapter `out`, set by svelte.config.js)
    package.json            generated: { type: "module", dependencies: core deps ∪ adapter packages, overrides: vendored }
    vendor/                 generated: one npm-pack tarball per vendored package (D9)
    …                       server bundle with the runtime manifest embedded; client assets
  deploy/<target>/          workDir of a deploy procedure
```

`createRuntimePackage(manifest, buildDir, coreDir)` builds `package.json` from:
- **the bundle's imports:** every bare specifier in a static or string-literal dynamic `import` in the server output, reduced to its package name. `node:` builtins are ignored. Anything bare left in the output is external by definition (R2), so it must be installed, and nothing else needs to be. Core's build tooling (`vite`, `vitest`, `tailwindcss`) never appears there.
- **the adapter packages:** the package of every runtime specifier in `manifest.adapters`. The host imports these with a non-literal specifier (D4), so no scan can see them.
- **versions** read from each package's installed `package.json`, resolved from `coreDir`.
- **vendored packages** (D9): each one's entry becomes `file:vendor/<tarball>`, and `overrides` maps every vendored name to its tarball, so a vendored package's own dependency on another vendored one resolves to the tarball as well. `overrides` is required: without it a nested `@genoacms/contracts@^0.0.1` goes to the registry (S-8).

It contains no workspace protocols and no dev dependencies. A tarball may still declare
`workspace:` dependencies, because `npm pack` does not rewrite them. `overrides` replaces those
specs before npm parses them (S-8). A dependency with a protocol npm cannot parse whose name is
**not** vendored fails the build. Core's own `package.json` is not changed.

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

**Constraint:** every listed package that is **not vendored** must be installable from the registry
where the target installs dependencies. Vendored packages (D9) need no registry. Deploying from the
monorepo therefore needs no published `@genoacms/*` version.

SvelteKit's intermediate `.svelte-kit/` stays inside the installed core package. Moving it would
break core's `tsconfig.json`, which extends `./.svelte-kit/tsconfig.json`. The build only creates new
files there and never modifies installed ones.

## Targets

| Target | SvelteKit adapter | Procedure |
| :-- | :-- | :-- |
| `@genoacms/adapter-node` | `@sveltejs/adapter-node` | Copies `buildDir` to `options.outDir` (default `<project>/build`). The operator runs `npm install --omit=dev` there, as with any adapter-node output. |
| `@genoacms/adapter-gcp/deployment` | `@genoacms/sveltekit-adapter-cloud-run-functions` | Archives `buildDir`. Adds a generated `function.js` that exports `genoacms` from the build's handler, and sets `"main": "function.js"` in the archived `package.json`. Uploads, then creates or updates the function. Buildpacks install the dependencies (R4). **No project source and no config leave the machine** (fixes F9, F15). GCP specifics, findings and IAM: [`adapter-gcp/deployment.md`](adapter-gcp/deployment.md). |
| `@genoacms/adapter-aws/deployment` | `@sveltejs/adapter-node` + the Lambda wrapper | Ported (F14). Lambda does not install dependencies, so the procedure runs `npm install --omit=dev` in its `workDir` before zipping. |

## Lifecycle

```
DEVELOPMENT   genoa dev [--config f] [--mode m]            (monorepo: pnpm dev in packages/core)
  cli    root = cwd; spawn `vite dev`, cwd = <core>, GENOA_PROJECT, GENOA_CONFIG
  vite   genoa(): loadConfig(mode = config.mode = 'development') → manifest (with source)
                  virtual:genoa/manifest; watch source.dependencies
         svelte.config.js: resolveKitAdapter() → target's SvelteKit adapter, or none if no targets
  core   host.server.ts: createHost({ manifest, load })          no I/O
         hooks: ensureInstanceInitialized() → host.secrets() (secrets-env) → root seed → default bucket
  edit   config or any file it imports → reload manifest → server.restart()

BUILD         genoa build [target] [--config f] [--no-inline] [--mode m]
  cli    loadConfig(mode = --mode, default production) → refuse on any error
         target = arg ?? deployment.default ?? first key
         spawn `vite build`, cwd = <core>, GENOA_PROJECT, GENOA_CONFIG, GENOA_TARGET, GENOA_MODE
  kit    svelte.config.js: descriptor(target) → (await descriptor.svelteKitAdapter()).default(svelteKitOptions + out)
  vite   genoa(): embeds the RuntimeManifest; adapter runtimes stay external (D4)
  cli    write .genoacms/build/package.json (The artifact)

DEPLOY        genoa deploy [target] [--config f] [--no-inline] [--mode m]
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

The CLI's commands, flags and messages are specified in [`cli.md`](cli.md).

**Mode** is `GENOA_MODE` (D7), never Vite's `mode`. `genoa build --mode development` sets it to
`development` and produces a development artifact: its manifest carries `source.root` and it may use `developmentOnly` adapters. Core's
Playwright suite uses this (`build && preview` against the dev store), replacing today's
`deploy --dev`.

`scripts/rotate-root.ts` keeps running under `vite-node` with core's Vite config, so it gets the same
plugin, manifest and host. `genoa rotate-root` spawns it with `GENOA_PROJECT` and `GENOA_CONFIG`,
without `npm explore` and without `GENOA_BUILD`.

## Non-goals

- Changing core's `dependencies` (U6).

## Rejected alternatives

| Alternative | Why rejected |
| :-- | :-- |
| **Remote build on GCP** (today's intent) | It uploads the project source, including the config directory and credentials (F9), and it needs the config and a build script at the remote end. Building locally also lets CI verify exactly what ships. |
| **Runtime `package.json` = core's `dependencies`** | Would install `vite`, `vitest` and the tailwind toolchain on every function. Moving them to `devDependencies` breaks users, who build core from their own install (U6). |
| **Fully self-contained bundle, no install** | Would bundle `typescript`, `ts-morph`, `jsdom` and gRPC SDKs through rollup, which is the most fragile option. |

## Critique & architectural sanity check: D8 (nothing constructed while building)

**Pros**
- A build no longer reads or writes the instance it is built for. Before, every build bootstrapped the configured instance, and the old Cloud Build flow did so for production.
- The production config builds with no credential present, which goal 6 always claimed and never delivered.
- The loader check makes the invariant enforced rather than remembered: new module-scope I/O fails the build by name.

**Cons & trade-offs**
- Core now depends on `$app/environment` in two service modules and in `host.server.ts`. Those modules are only ever evaluated by SvelteKit, but unit tests have to provide the flag (Vitest resolves it to `false` through SvelteKit's plugin).
- The collection listing reads as empty during analysis. Nothing prerenders, so nothing observes it. A prerendered page that listed collections would be built empty.

**Blindspots & missed edge cases**
- **Module-scope I/O outside these two sites.** The loader check catches provider construction, but not direct `fetch` or file I/O at import time. A module that reads a remote resource without the host would still run during the build.
- **Runtime failures that bypass promises.** The build crash surfaced as an uncaught exception thrown by the GCP auth library outside the promise chain. K1's "never rejects" guarantee therefore does not cover every provider failure. On a real instance, missing ADC could crash the process instead of degrading. That is not addressed here.
- **Prerendering.** `building` is also true while prerendering. If a page is ever prerendered, it cannot reach a provider, by design. That is correct for this CMS, but it has to be known.

## Critique & architectural sanity check: D9 (local packages travel inside the artifact)

**Pros**
- The deployed adapter code is byte-for-byte what the developer's machine loaded. F19's silent case, a registry package with the same version and different code, cannot happen.
- Users can deploy adapters that exist only in their repository, from npm, pnpm or yarn projects, with no registry and no publish step.
- The monorepo deploys without a release, so a deploy no longer has to follow a publish.
- No deploy procedure changes. GCP, AWS and Node all copy `buildDir`, and both procedures that rewrite `package.json` spread the existing object, so `overrides` survives.
- Only npm is required, and it ships with Node.

**Cons & trade-offs**
- Adapters are repacked even when they came from the registry. The packed files are the installed ones, which the project's lockfile integrity already covered, but registry provenance is not carried into the artifact.
- The build now runs a child process per vendored package. A cold `npm pack` takes about a second, which is small next to `vite build`.
- The artifact is installed with npm only. A target whose operator insists on pnpm or yarn inside the artifact would need `pnpm.overrides` or `resolutions` as well. That is not specified.
- A vendored package's own dependencies still resolve by range at install time, as every transitive dependency does today. D9 pins nothing new.

**Blindspots & missed edge cases**
- **yarn v1 `file:` packages that are not adapters.** A local helper library that an adapter depends on, installed by yarn v1's copy, looks like a registry package. It is not vendored, and the artifact install fails with `E404` for it. Adapters themselves are covered by the unconditional rule.
- **Protocols other than `workspace:`.** pnpm `catalog:`, yarn `patch:` and `portal:` in a vendored package's dependencies, on a name that is not vendored, fail the build by rule. The build does not rewrite them.
- **Unbuilt packages.** `npm pack --ignore-scripts` packs whatever is on disk. A package whose `exports` target a `dist/` that was never built is refused by name. A stale `dist/` from an older source is not detected.
- **Secrets in a package directory.** `npm pack` includes whatever `files` or `.npmignore` let through. A deny-list of the repository's known secret filenames refuses the obvious cases. A credential under any other name ships.
- **Yarn Plug'n'Play.** There is no `node_modules`, so version lookup already fails with `build/not-installed`. D9 does not change that.
- **Native binaries in vendored packages** are packed as they are on the build machine. None of the packages vendored today has one. The AWS procedure's `--os`/`--cpu` question applies to registry dependencies and is separate.
