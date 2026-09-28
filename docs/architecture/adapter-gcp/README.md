# GCP adapter architecture

| | |
| :-- | :-- |
| Tier | 1 (architecture). RFCs for `@genoacms/adapter-gcp` and `@genoacms/sveltekit-adapter-cloud-run-functions` are derived from these documents. |
| Status | Draft for review |
| Date | 2026-09-28 |
| Scope | Everything GenoaCMS runs on Google Cloud: storage, database, secrets, deployment, authentication, the runtime and operator identities, IAM |
| Verified against | `refactor/configuration-architecture` at `3062d8f` |

## 0. How to read these documents

**What they describe.** The GCP side of GenoaCMS as it is (**current**), what is decided and not yet
built (**new**), and in brief how it got here (**history**). Each statement carries one of those
markers, so they never blur:

| Marker | Meaning |
| :-- | :-- |
| *(current)* | Implemented and verified at the commit in the header. Unmarked text is current. |
| **New** | Decided, not yet implemented. Names the RFC that implements it, or says that none exists yet. When the RFC lands, the marker is removed and the text becomes current. |
| *History* | A previous state, kept short: what it was, why it changed, and where it changed. |

**Relation to [`configuration.md`](../configuration.md).** That document defines the adapter model
this package implements: descriptors and runtimes (D2), the host (D3), bare-specifier loading (D4),
secret references (D5), the artifact (D6, D9) and deployment targets (§7). It stays authoritative for
all of that. These documents cover only what is specific to GCP. If they disagree on the adapter
model, `configuration.md` wins. If they disagree on a GCP detail, these documents win, and
`configuration.md` is corrected to point here.

**IDs** are prefixed `G`: `GU` (author decision), `GD` (design decision), `GF` (finding), `GS`
(verification), `GQ` (open question). They never collide with `configuration.md`'s IDs, and an ID
keeps its number when its text moves between these files.

| Document | Covers |
| :-- | :-- |
| this README | the package, the runtime identity, IAM, history, the register of every `G` ID |
| [`storage.md`](storage.md) | Cloud Storage |
| [`database.md`](database.md) | Firestore |
| [`secrets.md`](secrets.md) | Secret Manager |
| [`deployment.md`](deployment.md) | Cloud Run functions, the deploy procedure, the SvelteKit adapter |
| [`authentication.md`](authentication.md) | Identity Platform |

---

## 1. Decisions made by the author

| # | Decision | Where |
| :-- | :-- | :-- |
| GU1 | Production authentication on GCP uses **Identity Platform**. GenoaCMS stores no password and no password hash on GCP (`configuration.md` U13). | [`authentication.md`](authentication.md) GD2 |
| GU2 | At runtime every GCP client authenticates as **Application Default Credentials**, the function's own service account. A service-account key is used only by `genoa deploy`, on the operator's machine. | §3 |
| GU3 | 2026-09-28: the deploy waits for the platform and fails when it fails (GD1); the function's settings become target options (GD3); the upload's status is checked (GF2). The IAM gap (GF4) and the accumulating secret versions (GF5) are fixed where a simple fix exists. | [`deployment.md`](deployment.md), §4, [`secrets.md`](secrets.md) |

---

## 2. The package

`@genoacms/adapter-gcp` implements four GenoaCMS services on Google Cloud, plus one planned. Each is a
descriptor, which the build loads and which imports no SDK, and a runtime, which the host constructs
per provider (`configuration.md` D2, D3).

| Export | Google service | Document |
| :-- | :-- | :-- |
| `./storage`, `./storage/runtime` | Cloud Storage | [`storage.md`](storage.md) |
| `./database`, `./database/runtime` | Firestore (native mode) | [`database.md`](database.md) |
| `./secrets`, `./secrets/runtime` | Secret Manager | [`secrets.md`](secrets.md) |
| `./deployment` (descriptor and procedure; no runtime) | Cloud Run functions (2nd gen) | [`deployment.md`](deployment.md) |
| **New** `./authentication`, `./authentication/runtime` | Identity Platform | [`authentication.md`](authentication.md) |

Shared by all of them (`src/shared/serviceAccount.ts`):
- `ServiceAccount`: the fields of a key file the client libraries read.
- Every descriptor rejects unknown option keys, so a typo fails the build, and requires `projectId` as a non-empty string.
- `credentials` is optional everywhere and always a `Secret<ServiceAccount>` decoded as JSON. The secrets descriptor narrows it to a bootstrap secret (`env()` or `inline()`), because it cannot come from the store it configures.

Each construction owns its client and credential, so two providers on this adapter (for example two
GCP projects) never share either.

`@genoacms/sveltekit-adapter-cloud-run-functions` is part of the GCP stack but a separate package.
It is a dependency of `adapter-gcp`, loaded through the deployment descriptor (`configuration.md`
S-5), and is described in [`deployment.md`](deployment.md).

---

## 3. Identities (GU2)

Two identities act for an instance. GenoaCMS creates neither.

- **The runtime identity** is the service account the function runs as. Every runtime client omits `credentials` in production and uses ADC, so no credential ships with the build (`configuration.md` goal 5). *(current)* It is the project's default compute service account, because the deploy sets none (GF3). **New** (GD3, RFC-0021): the `gcp` target's `serviceAccount` option names it.
- **The operator identity** is whoever runs `genoa deploy`: the `gcp` target's `credentials` (a key, resolved on the operator's machine and never embedded in the build) or the operator's own ADC.

`credentials` on runtime descriptors exists for running outside GCP, for example core's development
config, which uses an inline key file (`configuration.md` U7).

---

## 4. IAM

What each identity needs. **This section is the fix for GF4:** until now these needs were written
nowhere, and the broad default compute service account hid them.

| Identity | Needs | On | Why |
| :-- | :-- | :-- | :-- |
| Runtime | read, create, overwrite, list, delete and move objects | every configured bucket | [`storage.md`](storage.md) |
| Runtime | `iam.serviceAccounts.signBlob` on **itself** | the runtime service account | signed URLs under ADC (GF8, verify with GS3) |
| Runtime | read and write documents | the configured Firestore database | [`database.md`](database.md) |
| Runtime | get and create secrets, add and access versions | the project's Secret Manager | core creates its signing seeds on first start ([`secrets.md`](secrets.md)) |
| Runtime | **New** (GD4, RFC-0022): list and destroy secret versions | the project's Secret Manager | superseded versions are destroyed (GF5) |
| Runtime | **New** (GD2): sign users in, as an IAM grant or an API key (GS1a) | Identity Platform | [`authentication.md`](authentication.md) |
| Operator | create, get and update functions; generate upload URLs; wait on operations | the project and region | [`deployment.md`](deployment.md) |
| Operator | act as the runtime service account (`iam.serviceAccounts.actAs`) | the runtime service account | a function can only be deployed to run as an account its deployer may use |

Predefined roles that cover these, as a starting point for operators:

| Identity | Roles |
| :-- | :-- |
| Runtime | `roles/storage.objectAdmin` on each bucket; `roles/datastore.user`; `roles/secretmanager.admin` (narrower: a custom role with `secretmanager.secrets.get`, `.create`, `secretmanager.versions.add`, `.access`, `.list`, `.destroy`); `roles/iam.serviceAccountTokenCreator` on itself |
| Operator | `roles/cloudfunctions.developer`; `roles/iam.serviceAccountUser` on the runtime service account |

A missing runtime grant fails loudly at runtime: storage reports unreachable storage, and the
bootstrap reports the secret it could not read or create. `genoa deploy` does not check grants (GQ2).

---

## 5. History

*History.* In brief, oldest first:

- **2023-10 to 2025-05** (`0.1` to `0.8.2`): the adapter implemented services of `@genoacms/cloudabstraction` as module-level singletons that read the whole config (`configuration.md` F5). Deployment uploaded the **project source**, including `genoa.config/`, and injected snippets for a remote build on GCP (`configuration.md` F9, F15). The service-account key went with it. Custom function names arrived in 2025-05.
- **2024-11**: `@genoacms/sveltekit-adapter-cloud-run-functions` was written, adapting SvelteKit to Cloud Run functions (2nd gen) instead of Firebase's adapter.
- **2026-08**: moved into the monorepo; the authorization service was removed from the abstraction (core owns authorization); a Secret Manager secrets service with atomic claims and generation preconditions on storage were added.
- **2026-09-27** (RFC-0007, RFC-0014): descriptors and runtimes replaced the services; the deploy switched to uploading the **build artifact** only, so no source, config or credential leaves the machine.
- **2026-09-28**: vendored runtime packages (`configuration.md` D9, RFC-0020) made the first live deploy of core possible, and it succeeded.

---

## 6. Register

Every `G` ID, where it lives, and its state.

| ID | Summary | State | Document |
| :-- | :-- | :-- | :-- |
| GU1 | Identity Platform authenticates on GCP | decided | [`authentication.md`](authentication.md) |
| GU2 | ADC at runtime; keys only for deploy | current | §3 |
| GU3 | Deployment and secrets fixes approved | decided | §1 |
| GD1 | The deploy waits for the platform and fails when it fails | new, RFC-0021 | [`deployment.md`](deployment.md) |
| GD2 | Identity Platform authentication adapter | new, after GS1 | [`authentication.md`](authentication.md) |
| GD3 | Function settings are target options | new, RFC-0021 | [`deployment.md`](deployment.md) |
| GD4 | Superseded secret versions are destroyed, with a recovery window | new, RFC-0022 | [`secrets.md`](secrets.md) |
| GF1 | The deploy reports success before the function is built | fixed by GD1 | [`deployment.md`](deployment.md) |
| GF2 | The upload ignores the HTTP status | fixed by RFC-0021 | [`deployment.md`](deployment.md) |
| GF3 | Function settings are hardcoded | fixed by GD3 | [`deployment.md`](deployment.md) |
| GF4 | The runtime's IAM needs were documented nowhere | fixed by §4 and GD3 | §4 |
| GF5 | Superseded secret versions accumulate | fixed by GD4 | [`secrets.md`](secrets.md) |
| GF6 | Any error looking up the function counts as "does not exist" | fixed by RFC-0021 | [`deployment.md`](deployment.md) |
| GF7 | `getClientAddress` returns the raw `X-Forwarded-For` list | open | [`deployment.md`](deployment.md) |
| GF8 | Signed URLs under ADC need `signBlob` on the runtime account | documented (§4) | [`storage.md`](storage.md) |
| GF9 | `getCollection` reads a whole collection | open | [`database.md`](database.md) |
| GF10 | Directory operations are unbounded and not atomic | open | [`storage.md`](storage.md) |
| GS1 | Identity Platform behavior | not run | [`authentication.md`](authentication.md) |
| GS2 | A failing build fails the deploy | with RFC-0021 | [`deployment.md`](deployment.md) |
| GS3 | Signed URLs work under the runtime identity | not run | [`storage.md`](storage.md) |
| GS4 | Version destruction and its recovery window | with RFC-0022 | [`secrets.md`](secrets.md) |
| GQ1 | Which function settings become options | answered by GD3 | [`deployment.md`](deployment.md) |
| GQ2 | Should the deploy check IAM grants? | recommendation: no | [`deployment.md`](deployment.md) |

---

## Critique & architectural sanity check: the document set

**Pros**
- Each service can be read and changed on its own, and each file stays short enough to review.
- The three markers keep "what runs today" and "what we decided" apart in the same text. The RFC for a **New** item removes the marker, so the documents converge on the code instead of drifting from it.
- The register makes a finding's life visible: open, decided, fixed.

**Cons & trade-offs**
- Six files instead of one. A cross-cutting change touches several, and the register has to be kept in step by hand.
- *(current)* text is only as true as its last verification. The header's commit says when that was.

**Blindspots & missed edge cases**
- `configuration.md` was written as a proposal and has no markers. Its GCP rows now point here, but the two documents follow different conventions until it is restructured the same way.
- There is no template for other adapters yet. AWS, which has recorded findings from the AWS discussion only in conversation, is the next candidate.
