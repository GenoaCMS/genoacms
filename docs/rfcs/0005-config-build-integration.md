---
type: rfc
number: 5
title: Vite plugin, SvelteKit adapter resolution, runtime `package.json`
status: implemented
commits: [99e7da0]
depends: [3, 4]
architecture: [configuration.md]
commit-subject: feat(config): integrate the manifest with Vite, SvelteKit and the build artifact
sections: legacy
---

# RFC-0005: Vite plugin, SvelteKit adapter resolution, runtime `package.json`

| | |
| :-- | :-- |
| Depends on | RFC-0003, RFC-0004 |
| Architecture | §4 D4, D6, D7; §5.2; §7.1; §9; spikes S-1, S-2, S-3, S-5, S-6, S-7 |
| Commit | `feat(config): integrate the manifest with Vite, SvelteKit and the build artifact` |

## 1. Summary

Add three pieces to `@genoacms/config`:

1. `@genoacms/config/vite`: the `genoa()` Vite plugin. It loads the config once per process, serves `virtual:genoa/manifest` (the runtime manifest) and restarts the dev server when the config or anything it imports changes.
2. `resolveKitAdapter()` in `@genoacms/config/load`. `svelte.config.js` calls it to obtain the SvelteKit adapter instance from the chosen deployment target's descriptor.
3. `@genoacms/config/build`: `createRuntimePackage()`. It scans a server build for the packages it imports and writes the artifact's `package.json`.

It also fixes the environment contract between the CLI and Vite (§4.1).

## 2. Files

**Create** (under `packages/config/`):

| File | Purpose |
| :-- | :-- |
| `src/environment.ts` | `readGenoaEnvironment`; §4.1 |
| `src/vite/index.ts` | `genoa()` plugin; §4.2 |
| `src/load/kit.ts` | `resolveKitAdapter`; §4.3 |
| `src/artifact/index.ts` | `createRuntimePackage`; §4.4 |
| `src/artifact/scan.ts` | `scanServerOutput`; §4.4.1 |
| `src/artifact/versions.ts` | `installedVersion`; §4.4.2 |
| `client.d.ts` | the virtual module declaration; §4.5 |
| | The directory is `artifact`, not `build`: the root `.gitignore` ignores every directory named `build/`. The public export keeps the name `./build`. |
| `src/vite/*.test.ts`, `src/load/kit.test.ts`, `src/artifact/*.test.ts` | §5 |

**Modify:**
- `packages/config/package.json`: add the exports `"./vite"` (`dist/vite/index.js`) and `"./build"` (`dist/artifact/index.js`), both with types and `"./client": { "types": "./client.d.ts" }`. Add `"client.d.ts"` to `files`.
- `packages/config/src/load/index.ts`: also export `resolveKitAdapter` and `readGenoaEnvironment` (for `svelte.config.js`).

**Delete:** none.

## 3. Non-goals

- No change to core, the CLI or any adapter. They adopt these in RFC-0014 and RFC-0015.
- No generated table of literal `import()`s (architecture §11: rejected).
- No lockfile generation for the artifact (architecture critique: known gap).

## 4. Specification

### 4.1 `src/environment.ts`: the process-boundary contract (D7)

```ts
interface GenoaEnvironment {
  /** GENOA_PROJECT: absolute project root. Fallback: process.cwd() (the monorepo's `pnpm dev` in packages/core). */
  root: string
  /** GENOA_CONFIG: absolute config file. Fallback: default lookup. */
  file?: string
  /** GENOA_TARGET: deployment target name. Build only. */
  target?: string
  /** GENOA_MODE, else `fallbackMode`. */
  mode: 'development' | 'production'
}

/**
 * `fallbackMode` applies only when GENOA_MODE is unset:
 * - the plugin passes `command === 'serve' ? 'development' : 'production'`;
 * - svelte.config.js, which cannot know Vite's command, passes 'development'.
 * The CLI and core's `build` script always set GENOA_MODE, so the fallbacks matter only for the
 * monorepo's `pnpm dev` and tooling such as vite-node and vitest.
 */
function readGenoaEnvironment (fallbackMode: 'development' | 'production', env: NodeJS.ProcessEnv = process.env): GenoaEnvironment
```

- `GENOA_PROJECT` and `GENOA_CONFIG` must be absolute when set. Otherwise throw `Error('genoa/relative-path: GENOA_PROJECT must be absolute')`, or the same message for `GENOA_CONFIG`.
- `GENOA_MODE` must be `development` or `production` when set. Otherwise throw.
- Never read Vite's `mode` (architecture D7: it is inconsistent across SvelteKit's internal builds).

### 4.2 `src/vite/index.ts`

```ts
import type { Plugin } from 'vite'

interface GenoaPluginOptions { root?: string, file?: string }   // override the environment; tests use them

function genoa (options?: GenoaPluginOptions): Plugin
```

Behavior:

| Hook | Action |
| :-- | :-- |
| `config(_, { command })` | Compute `env = readGenoaEnvironment(command === 'serve' ? 'development' : 'production')`, and apply `options` overrides. Store it. |
| `configResolved()` | `manifest = await loadConfig({ root, file, mode })`. That call is memoized per process (RFC-0003), so SvelteKit's repeated resolutions do not re-evaluate the config. |
| `resolveId(id)` | `'virtual:genoa/manifest'` → `'\0virtual:genoa/manifest'`. Otherwise `null`. |
| `load(id)` | For the resolved id: `` `export const manifest = ${JSON.stringify(toRuntimeManifest(manifest))}\n` ``. Otherwise `null`. |
| `configureServer(server)` | Add every path of `manifest.source?.dependencies` to `server.watcher`. On a `change` event for one of them: `clearLoadCache()`, then `await server.restart()`. |

- `name: 'genoacms'`, `enforce: 'pre'`.
- The plugin must not import `@genoacms/config/host`.
- The virtual module is imported only from `*.server.ts` files, and SvelteKit refuses it in client code by its server-only rule. The plugin adds no extra guard.

### 4.3 `src/load/kit.ts`

```ts
import type { SvelteKitAdapterFactory } from '@genoacms/contracts'

interface KitAdapterRequest {
  root: string
  file?: string
  mode: 'development' | 'production'
  /** Target name. Fallback: deployment.default, then the first key of deployment.targets. */
  target?: string
}

/**
 * The SvelteKit adapter instance for a target, or undefined when the config declares no deployment
 * targets. The dev server needs no adapter.
 */
declare function resolveKitAdapter (request: KitAdapterRequest): Promise<ReturnType<SvelteKitAdapterFactory> | undefined>
```

Flow:

```
manifest   = await loadConfig({ root, file, mode })
targets    = manifest.config.deployment?.targets
if targets is undefined or empty:
  if request.target is given: throw ConfigError('config/no-deployment-target')
  return undefined                              ← dev server, or a `vite build` without a target: SvelteKit warns, as today
name       = request.target ?? manifest.config.deployment.default ?? first key of targets
entry      = targets[name] ?? throw ConfigError('config/unknown-target', name + '; known: ' + keys)
descriptor = (await importFromProject(entry.adapter, root)).default
factory    = (await descriptor.svelteKitAdapter()).default
outDir     = join(root, '.genoacms', 'build')
return factory(descriptor.svelteKitOptions?.(entry.options, { outDir }) ?? {})
```

`svelteKitOptions` receives **unresolved** options. `resolveKitAdapter` never resolves references.

### 4.4 `src/artifact/index.ts`

```ts
interface RuntimePackageRequest {
  /** Absolute SvelteKit adapter output directory (the artifact). */
  buildDir: string
  /** Absolute directory of the installed @genoacms/core package; versions of core's externals resolve from here. */
  coreDir: string
  /** Absolute project root; adapter package versions come from the manifest. */
  root: string
  manifest: Manifest
}

interface RuntimePackageResult {
  /** The written package.json content. */
  pkg: { name: string, private: true, type: 'module', dependencies: Record<string, string> }
  /** Non-literal import()/require()/createRequire() sites, as "<relative file>: <construct>". Informational. */
  blind: string[]
}

declare function createRuntimePackage (request: RuntimePackageRequest): Promise<RuntimePackageResult>
```

Flow:
1. `scanned = scanServerOutput(buildDir)`.
2. `adapterPackages` = for each record in `manifest.adapters` with `kind !== 'deployment'`, the pair `[record.package, record.version]`.
3. `dependencies` = sorted by name:
   - each scanned package → `installedVersion(pkg, coreDir)`;
   - each adapter pair → its version.
   
   An adapter package also found by the scan uses the manifest version, and the two must be equal; otherwise throw `Error('build/version-conflict: <pkg>')`.
4. Write `<buildDir>/package.json`: `{ name: 'genoacms-runtime', private: true, type: 'module', dependencies }`, with two-space indentation and a trailing newline.
5. Return `{ pkg, blind: scanned.blind }`.

#### 4.4.1 `scanServerOutput(buildDir)`

- Walk `buildDir` recursively, skipping any directory named `client`, and read every `*.js` and `*.mjs` file.
- Parse each with `parseAst` from `vite` and walk every node:

| Node | Action |
| :-- | :-- |
| `ImportDeclaration`, `ExportAllDeclaration`, `ExportNamedDeclaration` with `source` | record `source.value` |
| `ImportExpression` with a `Literal` source | record its value |
| `ImportExpression` with any other source | append `<file>: import(<NodeType>)` to `blind` |
| `CallExpression` whose callee is the identifier `require` or `createRequire` | append `<file>: require(<arg>)` or `createRequire(<arg>)` to `blind` |

- Keep only **bare** specifiers. Not bare: anything starting with `.`, `/`, `node:`, `data:` or `file:`, and any Node builtin (`module.builtinModules`, first path segment).
- Reduce each to its package name (`packageNameOf`, RFC-0003).
- Return `{ packages: string[] (sorted, unique), blind: string[] }`.

#### 4.4.2 `installedVersion(pkg, fromDir)`

Mirrors Node's lookup order. For each ancestor `dir` of `fromDir`, the directory itself first:
- if `basename(dir) === 'node_modules'`, check `join(dir, pkg, 'package.json')`;
- otherwise check `join(dir, 'node_modules', pkg, 'package.json')`.

Return the first file's `version`. If none is found, throw `Error('build/not-installed: <pkg> (from <fromDir>)')`.

The `basename === 'node_modules'` case is required for pnpm, where core's dependencies are siblings
inside `.pnpm/<id>/node_modules`.

### 4.5 `client.d.ts`

```ts
declare module 'virtual:genoa/manifest' {
  export const manifest: import('./dist/manifest.js').RuntimeManifest
}
```

Core references it with `/// <reference types="@genoacms/config/client" />` in RFC-0014.

## 5. Tests

1. **`readGenoaEnvironment`:**
   - `GENOA_MODE` beats `fallbackMode`; unset uses it;
   - absolute-path enforcement;
   - an invalid `GENOA_MODE` throws;
   - Vite's `mode` is never consulted (the function has no parameter for it).
2. **Plugin, unit:** create the plugin with `root` and `file` of a `makeProject` fixture (RFC-0003 §5.1). Call its hooks directly:
   - after `config` and `configResolved`, `load('\0virtual:genoa/manifest')` returns a module whose JSON has no `deployment` and no deployment adapter records;
   - `resolveId` ignores other ids;
   - calling `configResolved` five times evaluates the config once (spy on `evaluateConfigModule` via `vi.mock`).
3. **Plugin, dev server:** a `createServer({ root: fixture, plugins: [genoa({ root, file })], server: { middlewareMode: true }, appType: 'custom' })` test.
   - `ssrLoadModule('virtual:genoa/manifest')` returns the runtime manifest.
   - Touching a dependency file triggers `server.restart` (spy), and the next load reflects the edit.
   - Close the server in `afterEach`.
4. **`resolveKitAdapter`:**
   - With a fake deployment descriptor package whose `svelteKitAdapter` loads a fake factory recording its options: the factory receives `svelteKitOptions(options, { outDir })` with `outDir === <root>/.genoacms/build`.
   - The target fallback order is argument, then `default`, then first key.
   - An unknown target gives `config/unknown-target`.
   - No deployment stanza gives `undefined`.
   - Options holding `{ $secret }` reach `svelteKitOptions` unresolved.
5. **`scanServerOutput`:** on a fixture directory of hand-written `.js` files covering every node kind in §4.4.1:
   - it finds static, re-export and literal dynamic imports;
   - it ignores relative imports, `node:` imports, builtins and `client/`;
   - it reports blind sites with file names.
6. **`installedVersion`:** in both an npm-style layout (`fromDir/node_modules/x`) and a pnpm-style layout (`…/.pnpm/c/node_modules/@genoacms/core` with sibling `…/.pnpm/c/node_modules/x`), both built in a temp dir. A missing package gives `build/not-installed`.
7. **`createRuntimePackage`:**
   - on a fixture build, it writes the expected `package.json` with the manifest's adapter packages merged in;
   - a conflicting adapter version throws;
   - `blind` is passed through.

## 6. Steps

1. Implement environment, then artifact/versions, artifact/scan, artifact/index, load/kit, vite/index, then client.d.ts.
2. Add the exports.
3. Write the tests, then run §7.

## 7. Verification

```bash
pnpm --filter @genoacms/config run test
pnpm --filter @genoacms/config run check
grep -rn "@genoacms/config/host\|/host/" packages/config/src/vite packages/config/src/artifact packages/config/src/load || echo "no host imports: ok"
git status --short
```

**Expected:**
- Tests and check exit 0.
- The grep prints `no host imports: ok`.
- `git status` lists only `packages/config/`.

## 8. Critique

**Pros.**
- The mode is an explicit input, and the plugin is idempotent across SvelteKit's repeated config resolution, which was the S-2 finding.
- The runtime `package.json` is exactly what the bundle imports plus the adapters, with no build tooling in it (U6).
- Descriptor and SvelteKit adapter loading are project-anchored (S-5, S-7).

**Cons & trade-offs.**
- `createRuntimePackage` pins exact versions but writes no lockfile, so transitive versions float at install time.
- The scanner depends on Rollup's AST shape through Vite's `parseAst`.

**Blindspots.**
- `blind` is informational. A new dependency that loads a package through `createRequire` passes the build and fails at runtime. RFC-0014 adds a boot smoke test of the Node artifact to catch this.
- The dev-server restart on config change restarts even for edits that would be safe to hot-apply. That is intended (architecture §9), but noticeable in large projects.
- `outDir` is fixed to `<root>/.genoacms/build`. A project wanting a different location has no option for it. None exists today either.
