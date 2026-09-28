# RFC-0020: Vendor local packages into the artifact

| | |
| :-- | :-- |
| Status | Implemented (`3062d8f`) |
| Depends on | RFC-0005, RFC-0015 |
| Architecture | D9, F19; §7.1; §13 S-8 |
| Commit | `feat(config): vendor local packages into the runtime artifact` |

Found preparing the first production deploy of core. Implement it after RFC-0015 and before RFC-0016.

## 1. Summary

`createRuntimePackage` pins every runtime dependency to its installed version, and the platform
installs those versions from npm. Unpublished packages then fail to install, and a registry package
with the same version and different code installs without error and fails at runtime (F19).

This RFC makes `createRuntimePackage` pack some packages with `npm pack` into `<buildDir>/vendor/`,
and point the runtime `package.json` at those tarballs through `dependencies` and `overrides` (D9):

1. every runtime adapter package named in the manifest, always;
2. every other package that is local (its real path has no `node_modules` segment), transitively from the packages vendored by rule 1 and from the scanned externals.

The build refuses, by name, a vendored package that is missing an `exports` target, would ship a
known secret file, or depends through a protocol npm cannot parse on a package that is not vendored.

## 2. Files

**Modify only:**

| File | Change |
| :-- | :-- |
| `packages/config/src/artifact/versions.ts` | §3.1 |
| `packages/config/src/artifact/versions.test.ts` | §3.5 |
| `packages/config/src/artifact/vendor.ts` | **new**, §3.2 |
| `packages/config/src/artifact/vendor.test.ts` | **new**, §3.5 |
| `packages/config/src/artifact/index.ts` | §3.3 |
| `packages/config/src/artifact/runtimePackage.test.ts` | §3.5 |
| `packages/cli/src/build.js` | §3.4 |

No deploy procedure changes. `adapter-gcp/src/deployment/archive.ts` and
`adapter-aws/src/deployment/stage.js` copy `buildDir`, so `vendor/` travels with it, and both spread
the existing `package.json` when they rewrite it, so `overrides` survives. Do not edit them.

## 3. Specification

### 3.1 `versions.ts`

Add and export `installedPackageDir`. It uses the same lookup as `installedVersion` and throws the same
error. It returns the directory that holds the found `package.json`, **without** resolving symlinks.

```ts
/** The directory of `pkg` as Node would find it from `fromDir`. Symlinks are not resolved. */
function installedPackageDir (pkg: string, fromDir: string): string
```

`installedVersion` becomes a one-liner over it: it reads `version` from
`join(installedPackageDir(pkg, fromDir), 'package.json')`. Its behavior and errors are unchanged.

### 3.2 `vendor.ts` (new)

**Exports:**

```ts
interface VendorRequest {
  /** Absolute artifact directory. `vendor/` is created inside it. */
  buildDir: string
  /** Absolute project root. Adapter packages resolve from here. */
  root: string
  /** Absolute core directory. Scanned externals resolve from here. */
  coreDir: string
  /** Package names of the manifest's runtime adapters (deployment targets excluded). */
  adapters: string[]
  /** Package names found by scanServerOutput. */
  scanned: string[]
}

interface VendoredPackage {
  name: string
  version: string
  /** Tarball file name inside `<buildDir>/vendor/`, as npm pack reports it. */
  filename: string
  /** `file:vendor/<filename>` */
  spec: string
}

/** Packs every package D9 selects into `<buildDir>/vendor/`, checked, sorted by name. */
async function vendorPackages (request: VendorRequest): Promise<VendoredPackage[]>

export { vendorPackages }
export type { VendorRequest, VendoredPackage }
```

**Internal functions.** One abstraction level each. The names are binding and the bodies are free.

| Function | Contract |
| :-- | :-- |
| `isLocal (dir: string): boolean` | `true` when `realpathSync(dir).split(sep)` contains no `'node_modules'` segment. |
| `collectVendored (request): Map<string, string>` | Package name → **real** directory. Seeds: every name in `adapters`, resolved with `installedPackageDir(name, root)`, unconditionally. Every name in `scanned`, resolved with `installedPackageDir(name, coreDir)`, only when `isLocal`. Then breadth-first over each collected package: read its `package.json` and, for every name in `dependencies`, `optionalDependencies` and `peerDependencies`, resolve it with `installedPackageDir(dep, <real directory of the collecting package>)`. Add it when `isLocal`. A missing `optionalDependencies` or `peerDependencies` entry (`build/not-installed`) is skipped; a missing `dependencies` entry rethrows. `devDependencies` are never read. |
| `addUnique (map, name, realDir): void` | Adds the entry. If `name` is already present with a different real directory, throws `build/vendor-conflict: <name> is installed from <a> and from <b>`. |
| `packPackage (dir: string, vendorDir: string): Promise<PackResult>` | Runs `execFile('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', vendorDir], { cwd: dir })` with no shell. Parses stdout as JSON and returns element `[0]` as `{ name, version, filename, files: string[] }`, where `files` holds the `path` of each entry. A non-zero exit rethrows as `build/vendor-pack-failed: <dir>: <first stderr line>`. |
| `exportTargets (pkg: PackageJson): string[]` | Every string leaf of `pkg.exports` (objects and arrays are walked), plus `pkg.main` when it is a string. Skips leaves under a `types` key and leaves containing `*`. Strips a leading `./`. |
| `checkComplete (packed, pkg): void` | Every `exportTargets(pkg)` entry must be in `packed.files`. Otherwise throws `build/vendor-incomplete: <name> lacks <path>; build the package before deploying`. |
| `checkNoSecrets (packed): void` | For every file whose basename is `serviceAccount.json`, `credentials.json`, `authCredentials.js` or `secrets.env`, or matches `/^\.env(\..+)?$/` and does not end in `.example`, throws `build/vendor-secret: <name> would ship <path>`. |
| `checkProtocols (pkg, vendoredNames: Set<string>): void` | For every `[dep, spec]` in `dependencies`, `optionalDependencies` and `peerDependencies` where `spec` matches `/^(workspace\|catalog\|link\|portal\|patch):/` and `dep` is not in `vendoredNames`, throws `build/vendor-protocol: <name> depends on <dep>@<spec>, which npm cannot install; vendor or publish <dep>`. |

**`vendorPackages` does, in order:**
1. `collectVendored(request)`;
2. `rm -rf <buildDir>/vendor`, then create it;
3. pack each collected package, sequentially, in name order;
4. for each one, read `package.json` from its **real directory**, then run `checkComplete`, `checkNoSecrets` and `checkProtocols` against the full set of collected names;
5. return the `VendoredPackage[]` sorted by name, with `spec = 'file:vendor/' + filename`.

The checks read the source `package.json` rather than the tarball's. `npm pack` does not change the
fields they read.

### 3.3 `index.ts`

- `RuntimePackage` gains `overrides?: Record<string, string>`.
- `RuntimePackageResult` gains `vendored: string[]`: the vendored names, sorted.
- `createRuntimePackage`:
  1. scan, as today;
  2. `mergeDependencies`, as today. `build/version-conflict` is still thrown before anything is packed;
  3. `vendorPackages({ buildDir, root, coreDir, adapters: [...adapterPackages(manifest).keys()], scanned: scanned.packages })`;
  4. a new function, `applyVendored (dependencies, specs): Record<string, string>`, replaces the value of every key of `dependencies` that `specs` has. It adds no keys, and the order stays sorted;
  5. `pkg` = `{ name, private, type, dependencies }`, plus `overrides: specs` **only when** at least one package was vendored. `specs` maps every vendored name to its spec, including names that are not direct dependencies;
  6. write the file and return `{ pkg, blind, vendored }`.
- Update the doc comment on `createRuntimePackage` with one sentence: "Adapters, and local packages reachable from them or from the bundle, are packed into `vendor/` and installed from there (architecture D9)."

`overrides` must repeat the direct dependency's spec exactly. npm rejects a direct dependency whose
override differs (`EOVERRIDE`), and step 4 guarantees they are equal.

### 3.4 `packages/cli/src/build.js`

Take `vendored` from `createRuntimePackage`'s result. Add `reportVendored(vendored)` next to
`reportBlindImports`: when the list is not empty, call `log.info` once with
`` `Packed into the artifact: ${vendored.join(', ')}` ``. `build` still returns
`{ manifest, target, buildDir }`.

### 3.5 Tests

All tests build real directories under `tmpdir()` and run the real `npm pack`. Pass
`{ timeout: 30_000 }` on every `describe` that packs.

**`versions.test.ts`:** one new case. `installedPackageDir` returns the symlink path, not its target,
for a package whose `node_modules` entry is a symlink (`symlinkSync(target, link, 'dir')`).

**`vendor.test.ts`** uses a fixture helper that writes `package.json` files and creates either a real
directory under `node_modules` (a registry-like package) or a symlink from `node_modules/<name>` to a
directory outside it (a local package). Cases:

1. An adapter installed as a real directory under `node_modules` is vendored anyway.
2. A local dependency of a vendored adapter is vendored. A registry-like dependency of it is not.
3. A scanned external that is local is vendored. One that is registry-like is not.
4. A local package's `devDependencies` are not followed.
5. A missing `peerDependencies` entry is skipped. A missing `dependencies` entry throws `build/not-installed`.
6. Two different real directories for one name throw `build/vendor-conflict`.
7. `exports: { '.': './dist/index.js' }` with no `dist/` throws `/^build\/vendor-incomplete: .* lacks dist\/index\.js/`. A `types` leaf pointing at a missing file does not throw.
8. A package containing `.env` throws `build/vendor-secret`, and one containing `.env.example` does not.
9. `dependencies: { other: 'workspace:^' }` passes when `other` is vendored, and throws `build/vendor-protocol` when it is not.
10. The returned list is sorted, each `spec` is `file:vendor/<filename>`, and each tarball exists in `<buildDir>/vendor/`.
11. A second run removes a tarball that the first run wrote and the second run no longer selects.

**`runtimePackage.test.ts`:** the first case's adapter is now vendored. Expect
`dependencies['@genoacms/adapter-x']` and `overrides['@genoacms/adapter-x']` to equal
`'file:vendor/genoacms-adapter-x-0.9.0.tgz'`, `jose` still at `'5.10.0'`, `vendored` to equal
`['@genoacms/adapter-x']`, and the tarball to exist. The version-conflict case is unchanged. Add
`{ timeout: 30_000 }`.

## 4. Non-goals

- No rewriting of a tarball's `package.json`. `workspace:` specs stay in the tarball, and `overrides` resolves them (§13 S-8, case B).
- No `pnpm.overrides` or `resolutions`. The artifact is installed with npm 9 or later (architecture D9).
- No change to any deploy procedure, and none of the AWS work (§7.2 critique and the separate AWS RFC).
- No detection of a stale `dist/`. Only a missing one is refused.
- No Windows support for the `npm` child process (`npm.cmd` needs a shell). The AWS procedure has the same limitation today.
- No Yarn Plug'n'Play support.
- No change to publishing, changesets or `release.yml`.
- No fix for the unhandled rejection when a GCP client finds no credentials at runtime (D8 critique, RFC-0019 non-goal).

## 5. Steps

1. Baseline. Record the output of every command in §6 that already exists: `@genoacms/config` has 72 tests passing; record `check`'s result and `@genoacms/cli`'s `test:unit` result.
2. §3.1 with its test.
3. §3.2 with `vendor.test.ts`.
4. §3.3 with the `runtimePackage.test.ts` update.
5. §3.4.
6. Run §6.

## 6. Verification

**Unit and type checks**, from the repository root:

```bash
pnpm --filter @genoacms/config test 2>&1 | tail -4
pnpm --filter @genoacms/config run check 2>&1 | tail -2
pnpm --filter @genoacms/cli run test:unit 2>&1 | tail -4
```

**Expected:** config at 72 plus the new cases, all passing; `check` no worse than the baseline; cli
no worse than the baseline.

**Production build of core.** No credential is read: `production.ts` only imports the service
account for the deploy target, which is never resolved by `build`. Run from `packages/core`:

```bash
pnpm run adapters
node ../cli/src/index.js build gcp --config genoa.config/production.ts 2>&1 | grep "Packed into the artifact"
ls .genoacms/build/vendor
node -e "const p=require('./.genoacms/build/package.json');const g=Object.entries(p.dependencies).filter(([k])=>k.startsWith('@genoacms/'));console.log(g.length>0&&g.every(([,v])=>v.startsWith('file:vendor/')),Object.keys(p.overrides).sort().join(' '))"
```

**Expected:** the log line names six packages; `vendor/` holds six `.tgz` files; the last command
prints:

```
true @genoacms/adapter-gcp @genoacms/authentication-adapter-array @genoacms/contracts @genoacms/internal @genoacms/language-adapter-ts @genoacms/sveltekit-adapter-cloud-run-functions
```

**No secret file in any tarball:**

```bash
for t in .genoacms/build/vendor/*.tgz; do tar -tzf "$t"; done \
  | grep -E '(^|/)(\.env(\.[^/]+)?|serviceAccount\.json|credentials\.json|authCredentials\.js|secrets\.env)$' \
  | grep -v '\.example$' || echo "no secret files vendored"
```

**Expected:** `no secret files vendored`.

**The artifact installs from its tarballs with three npm majors.** It needs no registry for
`@genoacms/*`, the colliding `adapter-gcp@0.8.2-1` included:

```bash
for v in 11 10.9.2 9.9.4; do
  D=$(mktemp -d); cp -r .genoacms/build/. "$D"
  (cd "$D" && npx -y npm@$v install --omit=dev --no-audit --no-fund > /dev/null 2>&1 && node --input-type=module -e "
    import { readFileSync } from 'node:fs'
    const lock = JSON.parse(readFileSync('package-lock.json', 'utf-8')).packages
    const ours = Object.entries(lock).filter(([k]) => k.includes('node_modules/@genoacms/'))
    const vendored = ours.every(([, v]) => String(v.resolved).startsWith('file:vendor/'))
    const single = ours.every(([k]) => k.split('node_modules/').length === 2)
    for (const s of ['@genoacms/adapter-gcp/secrets/runtime', '@genoacms/adapter-gcp/storage/runtime', '@genoacms/adapter-gcp/database/runtime', '@genoacms/authentication-adapter-array/runtime', '@genoacms/language-adapter-ts/runtime']) await import(s)
    console.log('npm $v', vendored, single, 'imports ok')
  ")
  rm -rf "$D"
done
```

**Expected:** three lines, `npm <v> true true imports ok`.

**Refusal of an incompletely built package.** Removing the whole `dist/` does not reach vendoring:
the loader refuses first with `config/invalid`, because the descriptors are in `dist/` too. So remove
only a runtime module, which nothing loads during the build. `dist/` is build output and gitignored:

```bash
mv ../adapter-gcp/dist/secrets/runtime.js ../adapter-gcp/runtime.js.off
node ../cli/src/index.js build gcp --config genoa.config/production.ts 2>&1 | grep -o 'build/vendor-incomplete: @genoacms/adapter-gcp lacks [^;]*'
mv ../adapter-gcp/runtime.js.off ../adapter-gcp/dist/secrets/runtime.js
```

**Expected:** one line, `build/vendor-incomplete: @genoacms/adapter-gcp lacks dist/secrets/runtime.js`,
and the file restored.

The live GCP deploy is not part of this RFC. The author runs it after the merge (U10).

## 7. Critique

**Pros.**
- The deploy installs exactly the adapter code that was built and tested locally. F19's silent version collision is gone, and so is the need to publish before deploying.
- User adapters kept in the user's repository deploy under npm, pnpm and yarn (node-modules linker), because packing only needs npm.
- The change is contained in `@genoacms/config`'s artifact module and one log line in the CLI. No deploy procedure changes.
- Each refusal names the package and the file, and happens on the developer's machine before anything is uploaded.

**Cons & trade-offs.**
- The build runs `npm pack` once per vendored package: six child processes for core, about a second each when npm is cold.
- Unit tests now need `npm` on `PATH` and spawn it. CI has it, and the suites get a 30-second timeout.
- Registry adapters are repacked from `node_modules`. The files are the ones the project's lockfile verified, but registry provenance does not carry into the artifact.

**Blindspots.**
- A yarn v1 `file:` package that is not an adapter looks like a registry package. It is not vendored, and the artifact install fails with `E404` (architecture D9 critique).
- The protocol check only covers the protocols it lists. An unknown future protocol would reach npm and fail at install, on the platform rather than at build.
- `checkComplete` ignores wildcard exports (`./*`). A package that exports only through wildcards is not checked.
- The secret deny-list covers the repository's known filenames only. A credential under another name inside a vendored package's `files` ships.
- Adapters of kind `deployment` are not vendored, which is correct because the runtime never loads them. But a runtime adapter that depends on its own deployment package (as `adapter-gcp` depends on the cloud-run SvelteKit adapter) vendors that package as a side effect.
