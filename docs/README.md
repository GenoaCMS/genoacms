---
type: docs-index
workflow: 3.0.0
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
| [`architecture/configuration.md`](architecture/configuration.md) | none: it predates the workflow, and its IDs (`U`, `D`, `F`, `S`, `Q`, `C`, `A`, `P`, `K`, `R`) are unprefixed | — | config files, the manifest, adapters as descriptors and runtimes, the host, secrets, the build, the artifact, deployment targets, the CLI | **no** (`conforms: false`): written as a proposal. Restructuring pending. |
| [`architecture/adapter-gcp/`](architecture/adapter-gcp/README.md) | `G` | `COM`, `STO`, `DB`, `SEC`, `DEP`, `ADP`, `AUTH` | everything GenoaCMS runs on Google Cloud | yes. 55 current statements: 48 name a test, 2 are partly verified, 5 are unverified (a type, and the SvelteKit adapter's build steps ADP-1 to ADP-4); 8 more are **New** (authentication). |
| [`rfcs/`](rfcs/README.md) | — | — | implementation specifications, in implementation order. RFC-0001 to RFC-0024 predate the workflow (`sections: legacy`). | — |

## Coverage

What the Specifications cover, measured against the reproducibility principle
([`WORKFLOW.md`](WORKFLOW.md) §1). "None" means that rebuilding the component would need its code.

| Area | Packages | Covered by | State |
| :-- | :-- | :-- | :-- |
| Configuration, adapter model, build, artifact, CLI | `config`, `contracts`, `cli`, `conformance` | `configuration.md` | covered, not restructured |
| GCP | `adapter-gcp`, `sveltekit-adapter-cloud-run-functions` | `adapter-gcp/` | covered; remaining test gap: ADP-1 to ADP-4 |
| Other adapters | `adapter-aws`, `adapter-minio`, `adapter-node`, `adapter-postgres`, `adapter-secrets-env`, `authentication-adapter-array` | `configuration.md` (the adapter model only), RFC-0006 to RFC-0013 | partial: behavior per service is in RFCs only |
| Language adapter and script sandbox | `language-adapter-ts`, `internal` | RFC-0011 | partial |
| Core: authentication and sessions | `core` (`auth/`) | `configuration.md` F20, U13, U14 only | none |
| Core: authorization, roles, grants | `core` (`authorization/`) | none | none |
| Core: signing, keys, root rotation, manifests | `core` (`signing/`, `bootstrap`) | `configuration.md` §6.3 only | none |
| Core: security policy | `core` (`securityPolicy/`) | none | none |
| Core: storage browser, collections, database UI | `core` (`storage/`, `database/`, routes) | none | none |
| Core: pages, components, publication, editor | `core` (`components/`, routes) | none | none |
| Consumer SDK and demos | `sdk`, `demo-*` | `demo-deploy/README.md` (deployment only) | none |

## History

*History.* Until 2026-09-28 this file held the project's documentation conventions. They became the
Spec Workflow, a separate repository shared across projects, vendored here as `WORKFLOW.md` 1.0.0.
