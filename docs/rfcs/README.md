---
type: rfc-index
---

# RFCs: configuration architecture

Implementation specifications derived from [`docs/architecture/configuration.md`](../architecture/configuration.md)
(Tier 1), and from the GCP adapter architecture in [`docs/architecture/adapter-gcp/`](../architecture/adapter-gcp/README.md)
(RFC-0021 onwards, for GCP). The architecture documents are authoritative. If an RFC contradicts one, the RFC is wrong.

An RFC specifies a change. Once implemented it is history: the architecture documents carry the current
state, including every behavior-relevant detail an RFC introduced ([`WORKFLOW.md`](../WORKFLOW.md) §8).

Branch: `refactor/configuration-architecture`. The branch merges to `main` only after RFC-0017.

## Order

Every RFC's front matter states its status: `draft`, or `implemented` with its `commits`, after which it is
frozen ([`WORKFLOW.md`](../WORKFLOW.md) §8.2). RFC-0031 is the only draft. RFC-0001 to RFC-0024
predate the workflow and carry `sections: legacy`; new RFCs follow [`templates/rfc.md`](../templates/rfc.md).

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
| [0019](0019-no-provider-io-while-building.md) | No provider I/O while SvelteKit analyses the build (D8). Found verifying 0015, implemented before it. | `packages/core` |
| [0015](0015-cli.md) | CLI | `packages/cli` |
| [0020](0020-vendor-local-packages.md) | Vendor local packages into the artifact (D9, F19). Found preparing the first production deploy, implemented before 0016. | `packages/config`, `packages/cli` |
| [0021](0021-gcp-deploy-settings-and-completion.md) | GCP deploy waits for the platform; function settings are options (`adapter-gcp/deployment.md` GD1, GD3) | `packages/adapter-gcp` |
| [0022](0022-gcp-secret-version-cleanup.md) | Destroy superseded Secret Manager versions (`adapter-gcp/secrets.md` GD4) | `packages/adapter-gcp` |
| [0023](0023-cloud-run-origin-and-client-address.md) | Cloud Run functions honor `ORIGIN` and `XFF_DEPTH` (`adapter-gcp/deployment.md` GD5) | `packages/sveltekit-adapter-cloud-run-functions`, `packages/adapter-gcp` |
| [0024](0024-gcp-runtime-unit-tests.md) | Unit tests for every current GCP runtime statement (`adapter-gcp/README.md` GD6) | `packages/adapter-gcp` (tests only) |
| [0025](0025-gcp-contract-and-e2e-tests.md) | Contract and end-to-end tests for the GCP statements (`adapter-gcp/` GF15 to GF19) | `packages/adapter-gcp`, `packages/sveltekit-adapter-cloud-run-functions` (tests only), `scripts/`, CI |
| [0026](0026-aws-adapter-to-specification.md) | Bring the AWS adapter to its Specification (`adapter-aws/` WF1 to WF19) | `packages/adapter-aws`, `scripts/`, CI |
| [0027](0027-gcp-open-findings.md) | Fix the open GCP findings (`adapter-gcp/` GF10, GF20 to GF26) | `packages/adapter-gcp`, `packages/sveltekit-adapter-cloud-run-functions` |
| [0028](0028-cli-help-and-specification.md) | CLI help, guidance and its Specification (`cli.md` LF2 to LF6, LF8 to LF13) | `packages/cli`, `scripts/` |
| [0029](0029-aws-secret-delete-eventual.md) | A second delete of a secret just deleted may resolve `true` (`adapter-aws/` WF27) | `packages/adapter-aws` |
| [0030](0030-authentication-contract.md) | The authentication contract, sign-in across providers, session revalidation (`contracts/authentication.md` CU3, CU4, CD2, CD3) | `packages/contracts`, `packages/authentication-adapter-array`, `packages/conformance`, `packages/config`, `packages/core`, `scripts/` |
| [0031](0031-sign-in-limits.md) | Core limits failed sign-ins (`contracts/authentication.md` CD7, CF1). Deferred by the author, 2026-10-02. | `packages/config`, `packages/core` |
| [0032](0032-gcp-identity-platform-adapter.md) | The Identity Platform authentication adapter (`adapter-gcp/authentication-identity-platform.md` GD2, GU10, GU11). Implemented after 0030, before 0031. | `packages/adapter-gcp`, CI |
| [0016](0016-remove-cloudabstraction.md) | Delete `@genoacms/cloudabstraction` | `packages/cloudAbstraction`, `packages/internal` |
| [0017](0017-documentation-site.md) | Documentation site, with example configs checked in CI. Amended 2026-10-04. | `packages/docs`, `packages/core` (example configs), CI |

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
7. **Verification.** Every command in the RFC's *Verification* section must pass before committing, and so must `pnpm run docs:check`. A pre-existing failure is recorded as a baseline *before* starting and must not get worse.
8. **Commits.** Conventional commits, one per RFC, using the subject given in the RFC. No AI attribution. Documentation changes to `docs/` are committed separately from code.
9. **Secrets in tests.** Tests that need real cloud credentials are opt-in behind an environment variable named in the RFC, and they skip cleanly without it. CI has credentials only on pushes to `main`, through Workload Identity Federation, never as a key (RFC-0025).

## Shared vocabulary

| Term | Meaning |
| :-- | :-- |
| descriptor | SDK-free module a config entry names. Default export from `define*Adapter` / `defineDeploymentTarget`. |
| runtime | Module exporting `{ create(options, ctx) }`. Its bare specifier is `descriptor.runtime`. |
| manifest | JSON produced by `loadConfig`. The *runtime manifest* is the subset embedded in the server bundle. |
| host | The per-process object that constructs providers (`@genoacms/config/host`). |
| project root | Absolute directory holding `genoa.config.ts` or the `genoa.config/` directory. In the monorepo: `packages/core`. |
