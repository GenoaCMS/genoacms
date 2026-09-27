# RFCs: configuration architecture

Implementation specifications derived from [`docs/architecture/configuration.md`](../architecture/configuration.md)
(Tier 1). The architecture document is authoritative. If an RFC contradicts it, the RFC is wrong.

Branch: `refactor/configuration-architecture`. The branch merges to `main` only after RFC-0017.

## Order

Each RFC depends only on RFCs above it. Implement strictly in this order, and commit each RFC on its
own before starting the next.

| RFC | Title | Package(s) touched |
| :-- | :-- | :-- |
| [0001](0001-contracts-package.md) | `@genoacms/contracts` package | new `packages/contracts` |
| [0002](0002-conformance-package.md) | `@genoacms/conformance` package | new `packages/conformance` |
| [0003](0003-config-authoring-and-loader.md) | Config authoring API, loader, manifest | new `packages/config` |
| [0004](0004-config-host.md) | Host: resolution, bootstrap, construction | `packages/config` |
| [0005](0005-config-build-integration.md) | Vite plugin, SvelteKit adapter resolution, runtime `package.json` | `packages/config` |
| [0006](0006-adapter-secrets-env.md) | Port `adapter-secrets-env` | `packages/adapter-secrets-env` |
| [0007](0007-adapter-gcp.md) | Port `adapter-gcp` | `packages/adapter-gcp` |
| [0008](0008-adapter-minio.md) | Port `adapter-minio` | `packages/adapter-minio` |
| [0009](0009-adapter-postgres.md) | Port `adapter-postgres` | `packages/adapter-postgres` |
| [0010](0010-adapter-authentication-array.md) | Port `authentication-adapter-array` | `packages/authentication-adapter-array` |
| [0011](0011-adapter-language-ts.md) | Port `language-adapter-ts` | `packages/language-adapter-ts`, `packages/sdk` (test only) |
| [0012](0012-adapter-node.md) | Port `adapter-node` | `packages/adapter-node` |
| [0013](0013-adapter-aws.md) | Port `adapter-aws` | `packages/adapter-aws` |
| [0014](0014-cutover-core.md) | Cutover: flip adapter exports, integrate core | all adapters, `packages/core`, root `.gitignore` |
| [0018](0018-config-directory.md) | One config directory (U12). Written after 0014, implemented before 0015. | `packages/config`, `packages/core` |
| [0015](0015-cli.md) | CLI | `packages/cli` |
| [0016](0016-remove-cloudabstraction.md) | Delete `@genoacms/cloudabstraction` | `packages/cloudAbstraction`, `packages/internal` |
| [0017](0017-documentation-site.md) | Documentation site | `packages/docs` |

### Why the adapters do not change their `exports` before RFC-0014

An adapter's new descriptor must be published at the same specifier the old module uses
(`@genoacms/adapter-gcp/storage`, for example). Flipping that export while core still imports the
old module would break core between commits. So:

- RFCs 0006 to 0013 **add** the new modules and their tests next to the old ones, reachable by relative path only. Each package's `package.json` `exports` stays untouched.
- RFC-0014 flips every `exports` map, deletes the old modules and switches core in one commit.

This is not a compatibility layer. Old and new code never call each other, and the old code is
deleted in RFC-0014.

## Rules for every implementing agent

1. **Scope.** Touch only the files an RFC lists under *Files*. If a change seems to need another file, stop and report instead of editing it.
2. **Discovery rule.** If reality contradicts an RFC (an API that does not exist, a test that cannot pass as specified, a path that is wrong), stop. Report the contradiction and do not write a workaround. The architecture document and the RFC are corrected first.
3. **Secrets.** Never read, print, copy, move or delete these files: `.env`, `.env.*` (except `*.example`), `.genoacms/secrets.env`, `serviceAccount.json`, `credentials.json`, `authCredentials.js`. An RFC step that needs one of them to change is a **stop point** for the author. Never paste a credential value into a test, fixture or log.
4. **Package manager.** `pnpm` only. Run commands from the repository root unless a step says otherwise.
5. **Style.** Match the package's existing lint configuration and idiom. JavaScript packages use JSDoc and hand-written `.d.ts`; TypeScript packages compile with `tsc`. Doc comments explain *why*, as in the surrounding code.
6. **Functions.** One abstraction level per function; small single-purpose units.
7. **Verification.** Every command in the RFC's *Verification* section must pass before committing. A pre-existing failure is recorded as a baseline *before* starting and must not get worse.
8. **Commits.** Conventional commits, one per RFC, using the subject given in the RFC. No AI attribution. Documentation changes to `docs/` are committed separately from code.
9. **Secrets in tests.** Tests that need real cloud credentials are opt-in behind an environment variable named in the RFC, and they skip cleanly without it. CI never has credentials.

## Shared vocabulary

| Term | Meaning |
| :-- | :-- |
| descriptor | SDK-free module a config entry names. Default export from `define*Adapter` / `defineDeploymentTarget`. |
| runtime | Module exporting `{ create(options, ctx) }`. Its bare specifier is `descriptor.runtime`. |
| manifest | JSON produced by `loadConfig`. The *runtime manifest* is the subset embedded in the server bundle. |
| host | The per-process object that constructs providers (`@genoacms/config/host`). |
| project root | Absolute directory holding `genoa.config.ts` or the `genoa.config/` directory. In the monorepo: `packages/core`. |
