---
type: docs-index
workflow: 3.1.0
levels: [unit, integration, e2e, contract, conformance]
sources: [packages]
---

# GenoaCMS documentation

The architecture documents and RFCs of GenoaCMS, maintained under the Spec Workflow
([`WORKFLOW.md`](WORKFLOW.md)): people review specifications, agents write code, and tests connect the
two. The user-facing documentation site is a separate package, `packages/docs`.

Check the documents from the repository root with `pnpm run docs:check`
(`node docs/tools/check-docs.mjs docs`). It runs in CI.

## Documents

| Document | Prefix | Codes | Subject | Conforms |
| :-- | :-- | :-- | :-- | :-- |
| [`architecture/configuration.md`](architecture/configuration.md) | none: it predates the workflow, and its IDs (`U`, `D`, `F`, `S`, `Q`, `C`, `A`, `P`, `K`, `R`) are unprefixed, shared with the four documents split from it | — | config files, the manifest, the loader, one config per environment; the record of the 2026-09 redesign, and where each of its IDs now lives | **no** (`conforms: false`): written as a proposal. Restructuring pending. |
| [`architecture/host.md`](architecture/host.md) | none (as `configuration.md`) | — | the host: provider construction and caching | **no**: split from `configuration.md` unchanged |
| [`architecture/secrets.md`](architecture/secrets.md) | none (as `configuration.md`) | — | secret references, their resolution, the bootstrap, the development store | **no**: split from `configuration.md` unchanged |
| [`architecture/build.md`](architecture/build.md) | none (as `configuration.md`) | — | the build, the artifact, vendoring, deployment targets, the lifecycle | **no**: split from `configuration.md` unchanged |
| [`architecture/contracts/`](architecture/contracts/README.md) | `C` | `AUTHN` | the adapter model and the service contracts | partly: the index and `authentication.md` conform (1 current statement, unverified, a type; 6 more **New**); `adapter-model.md` was split from `configuration.md` unchanged and does not |
| [`architecture/identities.md`](architecture/identities.md) | `I` | `PWH`, `IDS` | self-owned identity stores: password hashing, the identity record, sign-in | yes. 12 statements, all **New** (no RFC yet). |
| [`architecture/adapter-gcp/`](architecture/adapter-gcp/README.md) | `G` | `COM`, `STO`, `DB`, `SEC`, `DEP`, `ADP`, `AUTH`, `FAUTH` | everything GenoaCMS runs on Google Cloud | yes. 55 current statements: 54 name a test, 1 of them partly verified (STO-8), and 1 is unverified (COM-1, a type); 14 more are **New** (authentication: 10 Identity Platform, 4 Firestore). |
| [`architecture/adapter-aws/`](architecture/adapter-aws/README.md) | `W` | `AWS`, `OBJ`, `DDB`, `ASM`, `LMB` | everything GenoaCMS runs on AWS | yes. 43 current statements: 42 name a test, and 1 is unverified (AWS-1, a type). |
| [`architecture/cli.md`](architecture/cli.md) | `L` | `CLI` | the `genoa` command: its commands, flags, messages and help | yes. 19 statements: 10 current, unverified until RFC-0028 adds their tests; 9 **New** (RFC-0028). |
| [`rfcs/`](rfcs/README.md) | — | — | implementation specifications, in implementation order. RFC-0001 to RFC-0024 predate the workflow (`sections: legacy`). | — |

## Coverage

What the Specifications cover, measured against the reproducibility principle
([`WORKFLOW.md`](WORKFLOW.md) §1). "None" means that rebuilding the component would need its code.

| Area | Packages | Covered by | State |
| :-- | :-- | :-- | :-- |
| Configuration, host, secrets, build, artifact | `config` | `configuration.md`, `host.md`, `secrets.md`, `build.md` | covered, not restructured |
| Adapter model and service contracts | `contracts`, `conformance` | `contracts/` | adapter model covered, not restructured; authentication specified (**New**); storage, database, secrets, language and deployment contracts: none, their types are the only description |
| CLI | `cli` | `cli.md` | specified; open findings LF2 to LF8, all but LF7 in RFC-0028 |
| GCP | `adapter-gcp`, `sveltekit-adapter-cloud-run-functions` | `adapter-gcp/` | covered; open finding: GF9 (needs paging in the contract first) |
| AWS | `adapter-aws` | `adapter-aws/` | covered; no open findings (WF1 to WF26 fixed, RFC-0026) |
| Other adapters | `adapter-minio`, `adapter-node`, `adapter-postgres`, `adapter-secrets-env`, `authentication-adapter-array` | `contracts/adapter-model.md` (the adapter model only), RFC-0006 to RFC-0013 | partial: behavior per service is in RFCs only. |
| Language adapter and script sandbox | `language-adapter-ts`, `internal` | RFC-0011 | partial |
| Core: authentication and sessions | `core` (`auth/`) | `contracts/authentication.md`: sign-in and session revalidation (**New**); the session family, tokens and cookie: none | partial |
| Core: authorization, roles, grants | `core` (`authorization/`) | none | none |
| Core: signing, keys, root rotation, manifests | `core` (`signing/`, `bootstrap`) | `secrets.md`, *Bootstrap ordering*, only | none |
| Core: security policy | `core` (`securityPolicy/`) | none | none |
| Core: storage browser, collections, database UI | `core` (`storage/`, `database/`, routes) | none | none |
| Core: pages, components, publication, editor | `core` (`components/`, routes) | none | none |
| Consumer SDK and demos | `sdk`, `demo-*` | `demo-deploy/README.md` (deployment only) | none |

## Test levels

`node scripts/test-level.mjs <level>` runs one level and writes its JUnit reports to `reports/<level>/`.

| Level | Meaning here | Runs in CI |
| :-- | :-- | :-- |
| `unit` | a package's vitest tests in `src/`, through its public interface, with external SDKs mocked | always |
| `integration` | tests with real collaborators: the file system, a local database or object store, the CLI run as a process (`packages/cli/src/main.test.js`) | always |
| `e2e` | the running system as users meet it: the CLI, a deployed function, core's UI; today the SvelteKit adapter's build served by the Functions Framework, in the package's `e2e/` directory | always |
| `contract` | tests against the real GCP and AWS services, the adapters' opt-in conformance runs among them | on `main`, with the credentials of the repository variables `GCP_WORKLOAD_IDENTITY_PROVIDER`, `GCP_TEST_SERVICE_ACCOUNT`, `GCP_TEST_PROJECT`, `GCP_TEST_BUCKET`, `GCP_TEST_REGION` and `AWS_TEST_ROLE_ARN`, `AWS_TEST_REGION`, `AWS_TEST_BUCKET`, `AWS_TEST_LAMBDA_ROLE`; without them the tests are skipped. Deferred on pull requests. |
| `conformance` | `@genoacms/conformance` run against a local implementation: in memory, Postgres, MinIO | always, except MinIO |

Known gaps in the test runs, recorded 2026-09-28 when the project adopted workflow 3.0.0:

- **Core is not built or tested in CI.** Its `vite build` and its vitest setup load `genoa.config/development.ts`, which imports gitignored credential files, so neither runs in a clean checkout. Its Playwright tests need a real GCP project.
- **`@genoacms/sdk`** passes every test but exits non-zero on vitest's `Timeout calling "onTaskUpdate"`.
- **`@genoacms/language-adapter-ts`** passes alone, but 16 tests exceed vitest's 5 s timeout when packages run in parallel. CI runs packages one at a time.
- **MinIO's conformance run is not in CI.** The MinIO server images on Docker Hub and quay.io now require registry authentication, so no public image can be pinned.
- **Comments that explain** (WORKFLOW §6.4) were reduced to ID references only in `adapter-gcp` and `sveltekit-adapter-cloud-run-functions`, the packages a conforming document covers. The other packages, about 14,000 comment lines, keep them until their components have architecture documents to hold the reasons.
- The only GCP finding still open is GF9, in [`architecture/adapter-gcp/`](architecture/adapter-gcp/README.md).

## History

*History.* Until 2026-09-28 this file held the project's documentation conventions. They became the
Spec Workflow, a separate repository shared across projects, vendored here as `WORKFLOW.md` 1.0.0.

*History.* On 2026-09-28 the project moved from workflow 1.0.0 to 3.0.0: statements declare their test
levels, tests carry statement IDs in their titles, and a verification record gates each release.
