---
type: architecture-index
title: GCP adapter architecture
prefix: G
codes: [COM]
verified: aa17eb9
---

# GCP adapter architecture

## Design

### Overview

Everything GenoaCMS runs on Google Cloud: storage, database, secrets, deployment, authentication, the
runtime and operator identities, and IAM. RFCs for `@genoacms/adapter-gcp` and
`@genoacms/sveltekit-adapter-cloud-run-functions` are derived from these documents. They follow the
Spec Workflow ([`docs/WORKFLOW.md`](../../WORKFLOW.md)). The ID prefix is `G`.

**Test references** name test files by path from the repository root, and each test carries the IDs of
the statements it checks in its title (`WORKFLOW.md` §6.2). `packages/adapter-gcp/test/conformance.test.ts`
runs `@genoacms/conformance` against real GCP, only with `GENOACMS_TEST_GCP=1`.

**Relation to the platform documents.** They define what this package implements: descriptors,
runtimes and bare-specifier loading ([`contracts/adapter-model.md`](../contracts/adapter-model.md)
D2, D4), the service contracts ([`contracts/`](../contracts/README.md)), the host
([`host.md`](../host.md) D3), secret references ([`secrets.md`](../secrets.md) D5), and the artifact
and deployment targets ([`build.md`](../build.md) D6, D9). They stay authoritative for all of that.
These documents cover only what is specific to GCP. If they disagree on the adapter model or a
contract, those documents win. If they disagree on a GCP detail, these documents win, and the other
is corrected to point here.

### Documents

| Document | Codes | Covers |
| :-- | :-- | :-- |
| this README | COM | the package, the identities, IAM, history, the register of every `G` ID |
| [`storage.md`](storage.md) | STO | Cloud Storage |
| [`database.md`](database.md) | DB | Firestore |
| [`secrets.md`](secrets.md) | SEC | Secret Manager |
| [`deployment.md`](deployment.md) | DEP, ADP | Cloud Run functions, the deploy procedure, the SvelteKit adapter |
| [`authentication-identity-platform.md`](authentication-identity-platform.md) | AUTH | Identity Platform |
| [`authentication-firestore.md`](authentication-firestore.md) | FAUTH | the Firestore identity store |

### Decisions

| # | Decision | Where |
| :-- | :-- | :-- |
| GU1 | Production authentication on GCP uses **Identity Platform** or, since GU9, the **Firestore identity store**. With Identity Platform, GenoaCMS stores no password and no password hash on GCP (`configuration.md` U13). | [`authentication-identity-platform.md`](authentication-identity-platform.md) GD2 |
| GU2 | At runtime every GCP client authenticates as **Application Default Credentials**, the function's own service account. A service-account key is used only by `genoa deploy`, on the operator's machine. | Identities |
| GU3 | 2026-09-28: the deploy waits for the platform and fails when it fails (GD1); the function's settings become target options (GD3); the upload's status is checked (GF2). The IAM gap (GF4) and the accumulating secret versions (GF5) are fixed where a simple fix exists. | [`deployment.md`](deployment.md), IAM, [`secrets.md`](secrets.md) |
| GU5 | 2026-09-29: SEC-9 and SEC-10 are verified at `unit` only. They describe the adapter's own handling, which the real service cannot provoke or show (RFC-0025). | [`secrets.md`](secrets.md) |
| GU6 | 2026-09-29: the contract tests run in production's project `genoacms`, confined to names unique to each run and removed after it, rather than in a separate project. | Verification |
| GU7 | 2026-09-29: the deploy contract tests create, update and delete a function on every push to `main`, as the only real check of GD1. | [`deployment.md`](deployment.md) |
| GU8 | 2026-10-01: RFC-0027 fixes GF10, GF20 to GF26 and GF28 together. Directory operations become bounded and stop at the first failure (GD7); the deploy disables the framework's ignored routes (GD8). | [`storage.md`](storage.md) GD7, [`deployment.md`](deployment.md) GD8 |
| GU9 | 2026-10-02: GCP offers two authentication adapters, chosen by the operator per deployment: `./authentication/identity-platform` (GD2) and `./authentication/firestore`, a self-owned identity store that hashes passwords as [`identities.md`](../identities.md) specifies (GD9). | [`authentication-firestore.md`](authentication-firestore.md) |
| GU10 | 2026-10-02: the Identity Platform adapter serves plain Firebase Authentication as well, with no option to choose between them: both are one service behind one API, and Identity Platform is Firebase Authentication upgraded. Only `tenantId` needs the upgrade. GS1 runs in `genoacms`, on its Firebase Authentication, with throwaway users removed after each run (GU6). | [`authentication-identity-platform.md`](authentication-identity-platform.md) |
| GU4 | 2026-09-28: the SvelteKit adapter honors `ORIGIN` and `XFF_DEPTH` rather than dropping `env.js` or adopting all of adapter-node's variables (GF7, GF14). | [`deployment.md`](deployment.md) GD5 |

**GD6. Every current runtime statement has a unit test (GF12, GF13, and SEC and DEP gaps).**
RFC-0024. STO-4 to STO-12, DB-3 to DB-7, SEC-3, SEC-5, SEC-10, SEC-11 and DEP-13 get unit
tests with the SDK mocked, as the existing runtime tests do. STO-5 and STO-8 use the real client library, because both URLs are formed locally. The mocks assert the calls the
Specification names: arguments, preconditions and error mapping. The opt-in conformance suite stays,
as the check against the real services.
*Why:* the author reviews Specifications, not code (`WORKFLOW.md` §1). A statement without a test
is a claim nobody checks, and the untested ones include core's optimistic concurrency (STO-6).
*Cost:* mocks encode the SDK's call shapes. An SDK upgrade that changes them breaks tests that do not
touch real behavior, while the conformance suite, which does, runs only on request. Concurrency in
STO-11 and STO-12 cannot be observed with mocks: the tests show which calls were made, not what a
partial failure leaves behind (GF10).

### The package

`@genoacms/adapter-gcp` implements four GenoaCMS services on Google Cloud, plus authentication, planned as two adapters. Each is a
descriptor, which the build loads and which imports no SDK, and a runtime, which the host constructs
per provider (`contracts/adapter-model.md` D2, `host.md` D3).

| Export | Google service | Document |
| :-- | :-- | :-- |
| `./storage`, `./storage/runtime` | Cloud Storage | [`storage.md`](storage.md) |
| `./database`, `./database/runtime` | Firestore (native mode) | [`database.md`](database.md) |
| `./secrets`, `./secrets/runtime` | Secret Manager | [`secrets.md`](secrets.md) |
| `./deployment` (descriptor and procedure; no runtime) | Cloud Run functions (2nd gen) | [`deployment.md`](deployment.md) |
| **New** `./authentication/identity-platform`, `./authentication/identity-platform/runtime` | Identity Platform | [`authentication-identity-platform.md`](authentication-identity-platform.md) |
| **New** `./authentication/firestore`, `./authentication/firestore/runtime` | Firestore (native mode), its own database | [`authentication-firestore.md`](authentication-firestore.md) |

What every service shares is specified once, in COM-1 to COM-4 at the end of this README.

Each construction owns its client and credential, so two providers on this adapter (for example two
GCP projects) never share either.

`@genoacms/sveltekit-adapter-cloud-run-functions` is part of the GCP stack but a separate package.
It is a dependency of `adapter-gcp`, loaded through the deployment descriptor (`configuration.md`
S-5), and is described in [`deployment.md`](deployment.md).

---

### Identities (GU2)

Two identities act for an instance. GenoaCMS creates neither.

- **The runtime identity** is the service account the function runs as. Every runtime client omits `credentials` in production and uses ADC, so no credential ships with the build (`configuration.md` goal 5). The `gcp` target's `serviceAccount` option names it (GD3). Without it, the function runs as the project's default compute service account.
- **The operator identity** is whoever runs `genoa deploy`: the `gcp` target's `credentials` (a key, resolved on the operator's machine and never embedded in the build) or the operator's own ADC.

`credentials` on runtime descriptors exists for running outside GCP, for example core's development
config, which uses an inline key file (`configuration.md` U7).

---

### IAM

What each identity needs. **This section is the fix for GF4:** until now these needs were written
nowhere, and the broad default compute service account hid them.

| Identity | Needs | On | Why |
| :-- | :-- | :-- | :-- |
| Runtime | read, create, overwrite, list, delete and move objects | every configured bucket | [`storage.md`](storage.md) |
| Runtime | `iam.serviceAccounts.signBlob` on **itself** | the runtime service account | signed URLs under ADC (GF8, verify with GS3) |
| Runtime | read and write documents | the configured Firestore database | [`database.md`](database.md) |
| Runtime | get and create secrets, add and access versions | the project's Secret Manager | core creates its signing seeds on first start ([`secrets.md`](secrets.md)) |
| Runtime | list and destroy secret versions | the project's Secret Manager | superseded versions are destroyed (GD4). Without it, overwrites warn and versions accumulate. |
| Runtime | **New** (GD2): sign users in, as an IAM grant or an API key (GS1a) | Identity Platform | [`authentication-identity-platform.md`](authentication-identity-platform.md) |
| Runtime | **New** (GD9): read and write documents | the identity database (GD10) | [`authentication-firestore.md`](authentication-firestore.md) |
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

### Findings

| # | Finding | State |
| :-- | :-- | :-- |
| GF4 | *History.* **The runtime's IAM needs were documented nowhere.** On first start core creates secrets, so the runtime identity needs to create secrets and add versions, not only read them. The default compute service account's broad roles hid this until someone narrowed it. | fixed: the IAM section, and the `serviceAccount` option (GD3) |
| GF30 | **RFC-0027's tests miss parts of their statements** (GS8). They pass when: a directory move lists only the first page, caps the listing, lists one level, or skips placeholders (STO-12); a listing hides any name containing `/.folderPlaceholder` (STO-9); the deploy request replaces the environment that `serviceConfig` builds (DEP-10, unit level); the handler serves no `.gz` variant, marks a non-200 immutable response immutable, does not decode a prerendered path, or joins header arrays differently (ADP-5); and, found by GS9, a delete that rejects with its last error, swallows a later page's listing error, overlaps a short page's deletes with the next page, or stops at an empty page (STO-11), and a listing that keeps the wrong entries over `limit`, compares names in UTF-16 order, or reads `limit: 0` as no limit (STO-9). | fixed, RFC-0027 |
| GF19 | *History.* **COM-3 is only partly tested.** The descriptor tests assert that a missing or empty `projectId` yields one reason, not its text. | fixed, RFC-0025 |

### Verification

**GS6, falsification audit of RFC-0025's statements (WORKFLOW §6.3), at `28107d2`, 2026-09-30.** An agent that did not write the tests (a different model, Sonnet 5) tried to break COM-3, STO-4, STO-6 to STO-12, SEC-3 to SEC-8, SEC-11, DEP-8 to DEP-13 and ADP-1 to ADP-7 by changing the code while the unit, integration and end-to-end tests still passed; it reasoned about the contract tests without running them. STO-4, STO-10, SEC-7, SEC-11 and DEP-13 held. The counterexamples are GF22 (a defect), GF23 (a clause nothing implements) and GF24 to GF26 (tests that miss parts of their statements).

**GS8, falsification audit of RFC-0027's statements, at `63891bd`, 2026-10-01.** An agent that wrote neither the code nor the tests made 44 mutations of STO-9, STO-11, STO-12, DEP-10 and ADP-5; 31 failed a test. Of the 13 that passed, GF30 records the gaps; three were not: `IGNORED_ROUTES` as the last key, and the prerendered middleware before the client one, which no observer can tell apart, and a `static/` middleware put back, which serves nothing (GF23). Reading the client library, it found GF29, and that STO-9's page was one item short after `startAfter`, which STO-9 now settles.

**GS9, falsification audit of STO-9 and STO-11 as amended, at `f771062`, 2026-10-01.** The same method, 32 mutations, 23 failed a test. Of the rest, two only lowered the delete bound, which STO-11 allows. Six were gaps, now in GF30: the last error instead of the first, a later page's listing error swallowed, a short page's deletes overlapping the next page's, an empty page ending the delete, the entries kept by `limit` chosen out of order, and `limit: 0` read as no limit. It found one defect, the order of names compared in UTF-16 rather than UTF-8 bytes (GF30), and STO-9 and STO-11 now state the page order, the stop after a failed delete and which entries `limit` keeps.

### History

*History.* In brief, oldest first:

- **2023-10 to 2025-05** (`0.1` to `0.8.2`): the adapter implemented services of `@genoacms/cloudabstraction` as module-level singletons that read the whole config (`configuration.md` F5). Deployment uploaded the **project source**, including `genoa.config/`, and injected snippets for a remote build on GCP (`configuration.md` F9, F15). The service-account key went with it. Custom function names arrived in 2025-05.
- **2024-11**: `@genoacms/sveltekit-adapter-cloud-run-functions` was written, adapting SvelteKit to Cloud Run functions (2nd gen) instead of Firebase's adapter.
- **2026-08**: moved into the monorepo; the authorization service was removed from the abstraction (core owns authorization); a Secret Manager secrets service with atomic claims and generation preconditions on storage were added.
- **2026-09-27** (RFC-0007, RFC-0014): descriptors and runtimes replaced the services; the deploy switched to uploading the **build artifact** only, so no source, config or credential leaves the machine.
- **2026-09-28, later**: the SvelteKit adapter honors `ORIGIN` and `XFF_DEPTH` (RFC-0023), and every current runtime statement got a unit test (RFC-0024).
- **2026-09-28**: vendored runtime packages (`build.md` D9, RFC-0020) made the first live deploy of core possible, and it succeeded. The same day, the deploy learned to wait for the platform and took its function settings from the target (RFC-0021), and Secret Manager stopped accumulating versions (RFC-0022).
- **2026-10-01** (RFC-0027): the open findings GF10 and GF20 to GF26 were fixed, with two more that its audits found (GF29, GF30): bounded directory operations (GD7), the framework's ignored routes disabled (GD8), and the missing tests.

---

### Register

Every `G` ID, where it lives, and its state.

| ID | Summary | State | Document |
| :-- | :-- | :-- | :-- |
| GU1 | Identity Platform, or the Firestore store (GU9), authenticates on GCP | decided | [`authentication-identity-platform.md`](authentication-identity-platform.md) |
| GU2 | ADC at runtime; keys only for deploy | current | README |
| GU3 | Deployment and secrets fixes approved | decided | README |
| GU4 | `ORIGIN` and `XFF_DEPTH` over the alternatives | decided | README |
| GU5 | SEC-9 and SEC-10 at `unit` only | decided | [`secrets.md`](secrets.md) |
| GU6 | Contract tests in production's project, confined per run | decided | README |
| GU7 | A real deploy on every push to `main` | decided | [`deployment.md`](deployment.md) |
| GU8 | RFC-0027's scope; bounded directory operations | decided | [`storage.md`](storage.md), [`deployment.md`](deployment.md) |
| GU9 | Two authentication adapters: Identity Platform and Firestore | decided | [`authentication-firestore.md`](authentication-firestore.md) |
| GU10 | Firebase Authentication served too, no toggle; GS1 in `genoacms` | decided | [`authentication-identity-platform.md`](authentication-identity-platform.md) |
| GD1 | The deploy waits for the platform and fails when it fails | current, RFC-0021 | [`deployment.md`](deployment.md) |
| GD2 | Identity Platform authentication adapter | new, after GS1 | [`authentication-identity-platform.md`](authentication-identity-platform.md) |
| GD3 | Function settings are target options | current, RFC-0021 | [`deployment.md`](deployment.md) |
| GD4 | Superseded secret versions are destroyed, with a recovery window | current, RFC-0022 | [`secrets.md`](secrets.md) |
| GD5 | The SvelteKit adapter honors `ORIGIN` and `XFF_DEPTH`; the target sets them | current, RFC-0023 | [`deployment.md`](deployment.md) |
| GD6 | Every current runtime statement has a unit test | current, RFC-0024 | README |
| GD7 | Directory operations are bounded and stop at the first failure | current, RFC-0027 | [`storage.md`](storage.md) |
| GD8 | The deploy disables the framework's ignored routes | current, RFC-0027 | [`deployment.md`](deployment.md) |
| GD9 | Firestore identity store | new, after CD7 and CQ2 | [`authentication-firestore.md`](authentication-firestore.md) |
| GD10 | Identities in their own Firestore database | new | [`authentication-firestore.md`](authentication-firestore.md) |
| GD11 | Unique emails through a collection keyed by the email's hash | new | [`authentication-firestore.md`](authentication-firestore.md) |
| GF1 | The deploy reported success before the function was built | fixed, RFC-0021 | [`deployment.md`](deployment.md) |
| GF2 | The upload ignored the HTTP status | fixed, RFC-0021 | [`deployment.md`](deployment.md) |
| GF3 | Function settings were hardcoded | fixed, RFC-0021 | [`deployment.md`](deployment.md) |
| GF4 | The runtime's IAM needs were documented nowhere | fixed, IAM and GD3 | README |
| GF5 | Superseded secret versions accumulated | fixed, RFC-0022 | [`secrets.md`](secrets.md) |
| GF6 | Any error looking up the function counted as "does not exist" | fixed, RFC-0021 | [`deployment.md`](deployment.md) |
| GF7 | `getClientAddress` returned the raw `X-Forwarded-For` list | fixed, RFC-0023 | [`deployment.md`](deployment.md) |
| GF8 | Signed URLs under ADC need `signBlob` on the runtime account | documented (IAM) | [`storage.md`](storage.md) |
| GF9 | `getCollection` reads a whole collection | open | [`database.md`](database.md) |
| GF10 | Directory operations are unbounded and not atomic | fixed, RFC-0027 | [`storage.md`](storage.md) |
| GF11 | The SvelteKit adapter's tests were disabled and stale | fixed, RFC-0023 and RFC-0025 | [`deployment.md`](deployment.md) |
| GF12 | Most of the storage runtime was untested | fixed, RFC-0024 | [`storage.md`](storage.md) |
| GF13 | The Firestore runtime's methods had no unit tests | fixed, RFC-0024 | [`database.md`](database.md) |
| GF14 | The SvelteKit adapter's `env.js` was dead code; `envPrefix` had no effect | fixed, RFC-0023 | [`deployment.md`](deployment.md) |
| GF15 | Most storage statements have no contract test | fixed, RFC-0025 | [`storage.md`](storage.md) |
| GF16 | The Secret Manager statements have no contract test | fixed, RFC-0025 | [`secrets.md`](secrets.md) |
| GF17 | The deploy procedure has no contract test | fixed, RFC-0025 | [`deployment.md`](deployment.md) |
| GF18 | The SvelteKit adapter has no end-to-end test | fixed, RFC-0025 | [`deployment.md`](deployment.md) |
| GF19 | COM-3 is only partly tested | fixed, RFC-0025 | README |
| GF20 | The Functions Framework answers 404 for `/favicon.ico` and `/robots.txt` | fixed, RFC-0027 | [`deployment.md`](deployment.md) |
| GF21 | `startAfter` is inclusive | fixed, RFC-0027 | [`storage.md`](storage.md) |
| GF22 | A directory moved to a name with `$` patterns gets wrong names | fixed, RFC-0027 | [`storage.md`](storage.md) |
| GF23 | ADP-5 and ADP-2 describe a `static/` directory nothing writes | fixed, RFC-0027 | [`deployment.md`](deployment.md) |
| GF29 | The client library's `deleteFiles` does not stop at the first failure | fixed, RFC-0027 | [`storage.md`](storage.md) |
| GF30 | RFC-0027's tests miss parts of their statements | fixed, RFC-0027 | README |
| GF24 | The storage tests miss parts of their statements | fixed, RFC-0027 | [`storage.md`](storage.md) |
| GF25 | The Secret Manager tests miss parts of their statements | fixed, RFC-0027 | [`secrets.md`](secrets.md) |
| GF26 | The deploy and SvelteKit adapter tests miss parts of their statements | fixed, RFC-0027 | [`deployment.md`](deployment.md) |
| GF27 | Disabling a secret version takes effect after a delay | documented | [`secrets.md`](secrets.md) |
| GF28 | DB-3's reasoning assumes CMS users define collections | fixed: the reason corrected | [`database.md`](database.md) |
| GF31 | DB-5 and DB-7 are effectively unverified at `contract` | open, fixed with CF7 | [`database.md`](database.md) |
| GS1 | Identity Platform behavior | not run | [`authentication-identity-platform.md`](authentication-identity-platform.md) |
| GS2 | A failing build fails the deploy (live) | automated, RFC-0025 | [`deployment.md`](deployment.md) |
| GS3 | Signed URLs work under the runtime identity | not run | [`storage.md`](storage.md) |
| GS4 | Version destruction and its recovery window (live) | automated, RFC-0025 | [`secrets.md`](secrets.md) |
| GS5 | `XFF_DEPTH` 1 yields the real client behind Google's front end (live) | not run (author) | [`deployment.md`](deployment.md) |
| GS6 | Falsification audit of RFC-0025's statements | run at `28107d2`; findings GF22 to GF26 | README |
| GS7 | The deployed framework serves `/favicon.ico` through the handler (live) | not run (author) | [`deployment.md`](deployment.md) |
| GS8 | Falsification audit of RFC-0027's statements | run at `63891bd`; findings GF29, GF30 | README |
| GS9 | Falsification audit of STO-9 and STO-11 as amended | run at `f771062`; finding GF30 | README |
| GS10 | 32 MiB per hash fits beside core on default memory (live) | not run | [`authentication-firestore.md`](authentication-firestore.md) |
| GQ1 | Which function settings become options | answered by GD3 | [`deployment.md`](deployment.md) |
| GQ2 | Should the deploy check IAM grants? | recommendation: no | [`deployment.md`](deployment.md) |

---

## Specification

### Shared (`src/shared/serviceAccount.ts`)

#### COM-1 · Service-account shape

`ServiceAccount` has the fields of a Google key file the client libraries read: `type`, `project_id`, `private_key_id`, `private_key`, `client_email`, `client_id`, and optionally `auth_uri`, `token_uri`, `auth_provider_x509_cert_url`, `client_x509_cert_url`, `universe_domain`. It is passed to the client libraries unchanged.

- Test: unverified (a type only)
- Level: unit

#### COM-2 · Unknown options are refused

Every descriptor refuses option keys outside its list, one reason per key: `unknown option '<key>'`.

- Test: `packages/adapter-gcp/src/storage/descriptor.test.ts`, `packages/adapter-gcp/src/database/descriptor.test.ts`, `packages/adapter-gcp/src/secrets/descriptor.test.ts`, `packages/adapter-gcp/src/deployment/descriptor.test.ts`
- Level: unit

#### COM-3 · Required string options

A required string option that is missing, not a string or empty yields `<key> is required and must be a non-empty string`. `projectId` is required by every descriptor.

- Test: `packages/adapter-gcp/src/storage/descriptor.test.ts`, `packages/adapter-gcp/src/database/descriptor.test.ts`, `packages/adapter-gcp/src/secrets/descriptor.test.ts`, `packages/adapter-gcp/src/deployment/descriptor.test.ts`
- Level: unit

#### COM-4 · One client per provider, ADC by default

Each provider construction creates its own client with its own credential. Two providers on one GCP service share neither, so two GCP projects can be served at once. `credentials` is optional on every descriptor, decoded as JSON, and passed to the client only when given. Otherwise the client uses ADC (GU2).

- Test: `packages/adapter-gcp/src/storage/runtime.test.ts`, `packages/adapter-gcp/src/database/runtime.test.ts`, `packages/adapter-gcp/src/secrets/runtime.test.ts`
- Level: unit
