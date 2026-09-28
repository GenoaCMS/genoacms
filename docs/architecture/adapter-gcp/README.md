# GCP adapter architecture

| | |
| :-- | :-- |
| Tier | 1 (architecture). RFCs for `@genoacms/adapter-gcp` and `@genoacms/sveltekit-adapter-cloud-run-functions` are derived from these documents. |
| Status | Draft for review |
| Date | 2026-09-28 |
| Scope | Everything GenoaCMS runs on Google Cloud: storage, database, secrets, deployment, authentication, the runtime and operator identities, IAM |
| Verified against | `refactor/configuration-architecture` at `7fd6744` |

## 0. How to read these documents

Markers (*(current)*, **New**, *History*), ID categories and the reproducibility goal follow the
project-wide conventions in [`docs/README.md`](../../README.md) §1. This directory's ID prefix is
`G`: `GU`, `GD`, `GF`, `GS`, `GQ`.

Every file has a **Design** part and a **Specification** part. Specification statements are numbered
per component: `COM` (shared, this README), `STO`, `DB`, `SEC`, `DEP`, `ADP` and `AUTH`. Test
references name a file relative to `packages/adapter-gcp/src/` and the test's title, as
`secrets/runtime.test.ts › reads a missing secret…`. "conformance" means the opt-in suite in
`packages/adapter-gcp/test/conformance.test.ts`, which runs `@genoacms/conformance` against real GCP
only with `GENOACMS_TEST_GCP=1`. "unverified" means that no test checks the statement.

**Relation to [`configuration.md`](../configuration.md).** That document defines the adapter model
this package implements: descriptors and runtimes (D2), the host (D3), bare-specifier loading (D4),
secret references (D5), the artifact (D6, D9) and deployment targets (§7). It stays authoritative for
all of that. These documents cover only what is specific to GCP. If they disagree on the adapter
model, `configuration.md` wins. If they disagree on a GCP detail, these documents win, and
`configuration.md` is corrected to point here.

| Document | Covers |
| :-- | :-- |
| this README | the package, the runtime identity, IAM, history, the register of every `G` ID |
| [`storage.md`](storage.md) | Cloud Storage |
| [`database.md`](database.md) | Firestore |
| [`secrets.md`](secrets.md) | Secret Manager |
| [`deployment.md`](deployment.md) | Cloud Run functions, the deploy procedure, the SvelteKit adapter |
| [`authentication.md`](authentication.md) | Identity Platform |

---

# Design

## 1. Decisions made by the author

| # | Decision | Where |
| :-- | :-- | :-- |
| GU1 | Production authentication on GCP uses **Identity Platform**. GenoaCMS stores no password and no password hash on GCP (`configuration.md` U13). | [`authentication.md`](authentication.md) GD2 |
| GU2 | At runtime every GCP client authenticates as **Application Default Credentials**, the function's own service account. A service-account key is used only by `genoa deploy`, on the operator's machine. | §3 |
| GU3 | 2026-09-28: the deploy waits for the platform and fails when it fails (GD1); the function's settings become target options (GD3); the upload's status is checked (GF2). The IAM gap (GF4) and the accumulating secret versions (GF5) are fixed where a simple fix exists. | [`deployment.md`](deployment.md), §4, [`secrets.md`](secrets.md) |
| GU4 | 2026-09-28: the SvelteKit adapter honors `ORIGIN` and `XFF_DEPTH` rather than dropping `env.js` or adopting all of adapter-node's variables (GF7, GF14). | [`deployment.md`](deployment.md) GD5 |

---

## 1a. Cross-cutting decisions

**GD6. Every current runtime statement has a unit test (GF12, GF13, and SEC and DEP gaps).**
**New** (RFC-0024). STO-4 to STO-12, DB-3 to DB-7, SEC-3, SEC-5, SEC-10, SEC-11 and DEP-13 get unit
tests with the SDK mocked, as the existing runtime tests do. The mocks assert the calls the
Specification names: arguments, preconditions and error mapping. The opt-in conformance suite stays,
as the check against the real services.
*Why:* the author reviews Specifications, not code (`docs/README.md` §1.4). A statement without a test
is a claim nobody checks, and the untested ones include core's optimistic concurrency (STO-6).
*Cost:* mocks encode the SDK's call shapes. An SDK upgrade that changes them breaks tests that do not
touch real behavior, while the conformance suite, which does, runs only on request.

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

What every service shares is specified once, in COM-1 to COM-4 at the end of this README.

Each construction owns its client and credential, so two providers on this adapter (for example two
GCP projects) never share either.

`@genoacms/sveltekit-adapter-cloud-run-functions` is part of the GCP stack but a separate package.
It is a dependency of `adapter-gcp`, loaded through the deployment descriptor (`configuration.md`
S-5), and is described in [`deployment.md`](deployment.md).

---

## 3. Identities (GU2)

Two identities act for an instance. GenoaCMS creates neither.

- **The runtime identity** is the service account the function runs as. Every runtime client omits `credentials` in production and uses ADC, so no credential ships with the build (`configuration.md` goal 5). The `gcp` target's `serviceAccount` option names it (GD3). Without it, the function runs as the project's default compute service account.
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
| Runtime | list and destroy secret versions | the project's Secret Manager | superseded versions are destroyed (GD4). Without it, overwrites warn and versions accumulate. |
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
- **2026-09-28**: vendored runtime packages (`configuration.md` D9, RFC-0020) made the first live deploy of core possible, and it succeeded. The same day, the deploy learned to wait for the platform and took its function settings from the target (RFC-0021), and Secret Manager stopped accumulating versions (RFC-0022).

---

## 6. Register

Every `G` ID, where it lives, and its state.

| ID | Summary | State | Document |
| :-- | :-- | :-- | :-- |
| GU1 | Identity Platform authenticates on GCP | decided | [`authentication.md`](authentication.md) |
| GU2 | ADC at runtime; keys only for deploy | current | §3 |
| GU3 | Deployment and secrets fixes approved | decided | §1 |
| GU4 | `ORIGIN` and `XFF_DEPTH` over the alternatives | decided | §1 |
| GD1 | The deploy waits for the platform and fails when it fails | current, RFC-0021 | [`deployment.md`](deployment.md) |
| GD2 | Identity Platform authentication adapter | new, after GS1 | [`authentication.md`](authentication.md) |
| GD3 | Function settings are target options | current, RFC-0021 | [`deployment.md`](deployment.md) |
| GD4 | Superseded secret versions are destroyed, with a recovery window | current, RFC-0022 | [`secrets.md`](secrets.md) |
| GD5 | The SvelteKit adapter honors `ORIGIN` and `XFF_DEPTH`; the target sets them | new, RFC-0023 | [`deployment.md`](deployment.md) |
| GD6 | Every current runtime statement has a unit test | new, RFC-0024 | §1a |
| GF1 | The deploy reported success before the function was built | fixed, RFC-0021 | [`deployment.md`](deployment.md) |
| GF2 | The upload ignored the HTTP status | fixed, RFC-0021 | [`deployment.md`](deployment.md) |
| GF3 | Function settings were hardcoded | fixed, RFC-0021 | [`deployment.md`](deployment.md) |
| GF4 | The runtime's IAM needs were documented nowhere | fixed, §4 and GD3 | §4 |
| GF5 | Superseded secret versions accumulated | fixed, RFC-0022 | [`secrets.md`](secrets.md) |
| GF6 | Any error looking up the function counted as "does not exist" | fixed, RFC-0021 | [`deployment.md`](deployment.md) |
| GF7 | `getClientAddress` returns the raw `X-Forwarded-For` list | decided: GD5, RFC-0023 | [`deployment.md`](deployment.md) |
| GF8 | Signed URLs under ADC need `signBlob` on the runtime account | documented (§4) | [`storage.md`](storage.md) |
| GF9 | `getCollection` reads a whole collection | open | [`database.md`](database.md) |
| GF10 | Directory operations are unbounded and not atomic | open | [`storage.md`](storage.md) |
| GF11 | The SvelteKit adapter's tests are disabled and stale | decided: GD5, RFC-0023 | [`deployment.md`](deployment.md) |
| GF12 | Most of the storage runtime is untested | decided: GD6, RFC-0024 | [`storage.md`](storage.md) |
| GF13 | The Firestore runtime's methods have no unit tests | decided: GD6, RFC-0024 | [`database.md`](database.md) |
| GF14 | The SvelteKit adapter's `env.js` is dead code; `envPrefix` has no effect | decided: GD5, RFC-0023 | [`deployment.md`](deployment.md) |
| GS1 | Identity Platform behavior | not run | [`authentication.md`](authentication.md) |
| GS2 | A failing build fails the deploy (live) | not run (author) | [`deployment.md`](deployment.md) |
| GS3 | Signed URLs work under the runtime identity | not run | [`storage.md`](storage.md) |
| GS4 | Version destruction and its recovery window (live) | unit tests pass; live not run (author) | [`secrets.md`](secrets.md) |
| GS5 | `XFF_DEPTH` 1 yields the real client behind Google's front end (live) | not run (author) | [`deployment.md`](deployment.md) |
| GQ1 | Which function settings become options | answered by GD3 | [`deployment.md`](deployment.md) |
| GQ2 | Should the deploy check IAM grants? | recommendation: no | [`deployment.md`](deployment.md) |

---

# Specification

## S1. Shared (`src/shared/serviceAccount.ts`)

| # | Statement | Test |
| :-- | :-- | :-- |
| COM-1 | `ServiceAccount` has the fields of a Google key file the client libraries read: `type`, `project_id`, `private_key_id`, `private_key`, `client_email`, `client_id`, and optionally `auth_uri`, `token_uri`, `auth_provider_x509_cert_url`, `client_x509_cert_url`, `universe_domain`. It is passed to the client libraries unchanged. | unverified (type only) |
| COM-2 | Every descriptor refuses option keys outside its list, one reason per key: `unknown option '<key>'`. | `storage/descriptor.test.ts`, `database/descriptor.test.ts`, `secrets/descriptor.test.ts`, `deployment/descriptor.test.ts` › the unknown-key cases |
| COM-3 | A required string option that is missing, not a string or empty yields `<key> is required and must be a non-empty string`. `projectId` is required by every descriptor. | the same four files › the missing- and empty-project cases |
| COM-4 | Each provider construction creates its own client with its own credential. Two providers on one GCP service share neither, so two GCP projects can be served at once. `credentials` is optional on every descriptor, decoded as JSON, and passed to the client only when given. Otherwise the client uses ADC (GU2). | `storage/runtime.test.ts` › builds one client per provider…; passes the project, and the credentials only when given; `database/runtime.test.ts`; `secrets/runtime.test.ts` › uses Application Default Credentials… |

## Critique & architectural sanity check: Design/Specification split

**Pros**
- Each Specification row is small enough to review on its own, and its Test column shows at a glance what is proven and what is only claimed.
- The split exposed what the old prose hid: GF11 to GF14 were found by asking of each statement which test checks it.

**Cons & trade-offs**
- Specification tables restate the code in prose. When code changes without its row, the table lies. Drift audits (`docs/README.md` §1.4) are the only guard.
- Test references by title break when a test is renamed. They are readable, but not checked by any tool.

**Blindspots & missed edge cases**
- A test reference proves that a test exists, not that it checks the whole statement. Several rows cite a test for part of a statement and say which part is unverified. Nothing enforces that honesty.
- The Specification is as complete as the author of the rows was careful. The only real completeness check is the reproducibility trial (`docs/README.md` §3).

## Critique & architectural sanity check: the document set

**Pros**
- Each service can be read and changed on its own, and each file stays short enough to review.
- The project-wide markers (`docs/README.md` §1.3) keep "what runs today" and "what we decided" apart in the same text. The RFC for a **New** item removes the marker, so the documents converge on the code instead of drifting from it.
- The register makes a finding's life visible: open, decided, fixed.

**Cons & trade-offs**
- Six files instead of one. A cross-cutting change touches several, and the register has to be kept in step by hand.
- *(current)* text is only as true as its last verification. The header's commit says when that was.

**Blindspots & missed edge cases**
- `configuration.md` was written as a proposal and has no markers. Its GCP rows now point here, but the two documents follow different conventions until it is restructured the same way.
- This directory is the first to follow the project-wide conventions and acts as their template. AWS, whose findings from the AWS discussion are recorded only in conversation, is the next candidate.

## Critique & architectural sanity check: GD6

**Pros**
- Every current statement becomes checkable on each commit without GCP credentials, which is what makes "review the Specification, not the code" hold for this package.
- Writing a test per statement exposes statements that are too vague to test, which is itself a Specification defect.

**Cons & trade-offs**
- Mock-based tests prove the calls, not the service's reaction to them. A precondition GCS interprets differently than assumed passes the unit test and fails in production. The opt-in conformance suite is the only guard, and it runs only on request.
- More test code to maintain across SDK upgrades.

**Blindspots & missed edge cases**
- Concurrency in STO-11 and STO-12 (parallel operations) cannot be observed meaningfully with mocks. The tests can assert which calls were made, not what a partial failure leaves behind (GF10).
