# GenoaCMS documentation

This directory holds the architecture documents (Tier 1) and the RFCs (Tier 2) of GenoaCMS. The
user-facing documentation site is a separate package, `packages/docs`.

The pipeline is one-directional: **reality → architecture documents → RFCs → code**. A discovery
made while implementing corrects the documents first, and code follows them (see the rules in
[`rfcs/README.md`](rfcs/README.md)).

## 1. Conventions

These conventions apply to every document in this directory. They are the repository's copy of the
author's general documentation conventions, kept here so that this repository is self-contained.

### 1.1 Goal: reproducibility

The architecture documents and RFCs together must be enough for a competent agent or human, **with
no access to the code**, to reproduce GenoaCMS functionally. Everything observable from outside a
component belongs in them:
- contracts and the types that cross them;
- data formats and persisted layouts (storage paths, document shapes, secret names);
- protocols and the external APIs used, with the calls and error handling;
- error codes and messages that callers or operators depend on;
- security invariants and the reasons for them;
- configuration surfaces and their defaults;
- the reasons behind every non-obvious choice.

Internal structure that does not change behavior does not belong.

### 1.2 Architecture documents describe the current state

An architecture document describes its whole subject, not only a change to it: the **current
state**, verified at a named commit; what is decided and not yet built; and a brief history.

RFCs are change specifications, and once implemented they are history. Any behavior-relevant detail
an RFC introduces, such as an error code, a default or a file layout, is also recorded in the
architecture document. Reproducing the system therefore never requires replaying RFCs in order.

### 1.3 Markers

| Marker | Meaning |
| :-- | :-- |
| *(current)* | Implemented and verified at the commit in the document's header. Unmarked text is current. |
| **New** | Decided, not yet implemented. Names the RFC that implements it, or says that none exists yet. When the RFC lands, the marker is removed and the text becomes current. |
| *History* | A previous state, kept short: what it was, why it changed, and when. |

Facts are also labeled by how they are known: established by experiment (a spike, with its date and
setup), taken from external documentation (named), or not yet verified.

### 1.4 IDs

Every architecture document, or directory of documents, has a unique **prefix** (§2). IDs combine the
prefix with a fixed category and a number:

| Category | Meaning |
| :-- | :-- |
| `U` | decision made by the author |
| `D` | design decision |
| `F` | finding: a fact about reality, usually a defect or constraint |
| `S` | verification: a spike or check, and its result |
| `Q` | open question, with a recommendation |

An ID keeps its number for life, including when its text moves between files. A directory of
documents keeps a register of its IDs and their states in its README.

### 1.5 Structure

A subject too large for one file becomes a directory with a `README.md` (overview, how its documents
relate, register) and one file per component. Every change to an architecture document or RFC ends
with a *Critique & architectural sanity check*: pros, cons and trade-offs, blindspots.

## 2. Index

| Document | Prefix | Subject | Conforms to §1 |
| :-- | :-- | :-- | :-- |
| [`architecture/configuration.md`](architecture/configuration.md) | none (predates the convention: `U`, `D`, `F`, `S`, `Q` and the preserved-functionality IDs `C`, `A`, `P`, `K`, `R`) | the configuration architecture: config files, the manifest, adapters as descriptors and runtimes, the host, secrets, the build, the artifact, deployment targets, the CLI | **no**: written as a proposal, no markers. Restructuring pending. |
| [`architecture/adapter-gcp/`](architecture/adapter-gcp/README.md) | `G` | everything GenoaCMS runs on Google Cloud | yes |
| [`rfcs/`](rfcs/README.md) | `RFC-NNNN` | implementation specifications, in implementation order | — |

## 3. Coverage

What the documents cover today, measured against §1.1. "None" means that reproducing the component
would need its code.

| Area | Packages | Covered by | State |
| :-- | :-- | :-- | :-- |
| Configuration, adapter model, build, artifact, CLI | `config`, `contracts`, `cli`, `conformance` | `configuration.md` | covered, not in the §1 form |
| GCP | `adapter-gcp`, `sveltekit-adapter-cloud-run-functions` | `adapter-gcp/` | covered |
| Other adapters | `adapter-aws`, `adapter-minio`, `adapter-node`, `adapter-postgres`, `adapter-secrets-env`, `authentication-adapter-array` | `configuration.md` (the adapter model only), RFC-0006 to RFC-0013 | partial: behavior per service is in RFCs only |
| Language adapter and script sandbox | `language-adapter-ts`, `internal` | RFC-0011 | partial |
| Core: authentication and sessions | `core` (`auth/`) | `configuration.md` F20, U13, U14 only | none |
| Core: authorization, roles, grants | `core` (`authorization/`) | none | none |
| Core: signing, keys, root rotation, manifests | `core` (`signing/`, `bootstrap`) | `configuration.md` §6.3 only | none |
| Core: security policy | `core` (`securityPolicy/`) | none | none |
| Core: storage browser, collections, database UI | `core` (`storage/`, `database/`, routes) | none | none |
| Core: pages, components, publication, editor | `core` (`components/`, routes) | none | none |
| Consumer SDK and demos | `sdk`, `demo-*` | `demo-deploy/README.md` (deployment only) | none |

---

## Critique & architectural sanity check: project-wide conventions

**Pros**
- One set of rules for every document, stated once and applied across projects. The GCP documents stop defining conventions of their own.
- The reproducibility goal gives each document a test: could someone rebuild this component from it? The coverage table turns that into a visible backlog.
- Recording RFC-introduced details in the architecture documents keeps them the single description of the current state, so RFCs can age as history.

**Cons & trade-offs**
- Reproducibility makes documents long. Contracts, formats and error codes restate what the code says, and every behavior change must update two places, the code and its document.
- The copy of the conventions here and the author's general copy can drift. There is no mechanism beyond care.

**Blindspots & missed edge cases**
- "Functionally reproducible" has no test yet. The only real check is an attempt: have an agent without the code rebuild one covered component, such as `adapter-gcp`'s secrets runtime, from its document and RFC, then run the original tests against the result.
- `configuration.md` is the largest document and does not conform. Until it is restructured, it mixes proposal, history and current state, and it is not clear what in it is still true.
- The UI is the hardest part to specify for reproduction. What counts as "functionally" equivalent for screens and interaction is not defined.
