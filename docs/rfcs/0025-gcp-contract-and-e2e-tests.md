---
type: rfc
number: 25
title: Contract and end-to-end tests for the GCP statements
status: draft
commits: []
depends: [24]
architecture: [architecture/adapter-gcp/README.md, architecture/adapter-gcp/storage.md, architecture/adapter-gcp/secrets.md, architecture/adapter-gcp/deployment.md]
changes: []
commit-subject: "test(adapter-gcp, sveltekit-adapter-cloud-run-functions): contract and end-to-end tests"
---

# RFC-0025: Contract and end-to-end tests for the GCP statements

## Summary

Every push to `main` fails the results checker: 28 statements declare the `contract` level and 3 the
`e2e` level without a test of that level (GF15 to GF18, and GF19 for COM-3's partial test). Until
they have one, no commit is releasable. This RFC adds those tests. It changes no statement and no
behavior of either package.

1. **Contract tests** run the GCP runtimes and the deploy procedure against the real Cloud Storage,
   Secret Manager and Cloud Functions services, opt-in with `GENOACMS_TEST_GCP=1`, as the conformance
   run already does. Each run works only under names unique to it and removes what it created.
2. **End-to-end tests** build a small SvelteKit app with the SvelteKit adapter and serve the result
   with the Functions Framework, the runtime Cloud Run functions uses, and send it real HTTP requests.
   They need no cloud, and also verify ADP-1 to ADP-4, which are `unverified` today.
3. **Test directories by level.** In both packages, `src/` holds unit tests, `test/` the opt-in tests
   against real services, and `e2e/` the end-to-end tests. `scripts/test-level.mjs` selects by
   directory, and CI runs the new `e2e` level on every run.
4. **COM-3's reason text** is asserted by the existing descriptor tests (GF19).

The author's decisions for it are GU5 to GU7 (2026-09-29): SEC-9 and SEC-10 are verified at `unit`
only; the contract tests run in production's project `genoacms`, confined to names unique to each
run; and the deploy tests run on every push to `main`.

## Files

**Modify or create only:**

| File | Change |
| :-- | :-- |
| `packages/adapter-gcp/test/contract/gcp.ts` | create: the opt-in switch, the environment, the run's unique names |
| `packages/adapter-gcp/test/contract/storage.test.ts` | create: STO contract tests |
| `packages/adapter-gcp/test/contract/secrets.test.ts` | create: SEC contract tests |
| `packages/adapter-gcp/test/contract/deployment.test.ts` | create: DEP contract tests |
| `packages/adapter-gcp/test/contract/artifact/` | create: `package.json` and `index.js` of a minimal build artifact |
| `packages/adapter-gcp/src/{storage,database,secrets,deployment}/descriptor.test.ts` | modify: assert the COM-3 reason text (GF19); no other assertion changes |
| `packages/adapter-gcp/package.json` | modify: script `test:contract` |
| `packages/sveltekit-adapter-cloud-run-functions/e2e/fixture/` | create: the SvelteKit app built by the tests |
| `packages/sveltekit-adapter-cloud-run-functions/e2e/adapter.test.js` | create: ADP end-to-end tests |
| `packages/sveltekit-adapter-cloud-run-functions/package.json` | modify: devDependencies `@google-cloud/functions-framework`, `svelte`, `vite`; script `test:e2e` |
| `packages/sveltekit-adapter-cloud-run-functions/vitest.config.js` | create: unit runs exclude `e2e/` |
| `scripts/test-level.mjs` | modify: levels by directory; new level `e2e` |
| `.github/workflows/ci.yml` | modify: run the `e2e` level on every run; pass `GENOACMS_TEST_GCP_REGION` |
| `docs/rfcs/README.md` | modify: rule 9 (credentials in CI) |
| `docs/README.md` | modify: Test levels; the CI variables |

## Specification

No statement is added, changed or removed, so `changes` is empty. The `Level:` lines of SEC-9 and
SEC-10 become `unit` (GU5); a `Level:` line is not part of a statement's text (WORKFLOW §11.3).

After implementation, the architecture documents name the new test files in the `Test:` lines of
STO-4, STO-6 to STO-12, SEC-3 to SEC-8, SEC-11, DEP-8 to DEP-13 and ADP-1 to ADP-7, drop the
`(unverified: …)` parts these tests close, record GF15 to GF19 as fixed, and record GS2, GS3 (when run
in CI under Workload Identity Federation) and GS4 as run.

### The contract environment

| Variable | Meaning |
| :-- | :-- |
| `GENOACMS_TEST_GCP` | `1` runs the contract tests; anything else skips them, one skipped test per file |
| `GENOACMS_TEST_GCP_PROJECT` | the project |
| `GENOACMS_TEST_GCP_BUCKET` | an existing bucket the identity may write |
| `GENOACMS_TEST_GCP_REGION` | the region for the deploy tests |

Credentials are Application Default Credentials only: `GOOGLE_APPLICATION_CREDENTIALS` on a
developer's machine, Workload Identity Federation in CI. No test reads a key file.

Each run takes a unique `runId` (base-36 time and 6 random characters) and touches only:
- objects under `genoacms-contract/<runId>/` in the bucket;
- secrets named `GENOACMS_CONTRACT_<runId>_<name>`;
- the function `genoacms-contract-<runId>` (lowercase, at most 63 characters).

Each file removes what it created in `afterAll` through the SDK directly, not through the runtime
under test, and a failed cleanup fails the file.

### The end-to-end fixture

`e2e/fixture/` is a SvelteKit app whose `svelte.config.js` passes `out`, `precompress` and `envPrefix`
to the adapter from `FIXTURE_OUT`, `FIXTURE_PRECOMPRESS` and `FIXTURE_ENV_PREFIX`. Its
`package.json` lists `@polka/url` under `dependencies`, imported by one route, to observe ADP-3. Routes:

| Route | Content |
| :-- | :-- |
| `/` | a server-rendered page |
| `/about` | a prerendered page, `trailingSlash: 'never'` |
| `/echo` | `POST`: `{ href, body }` of the request, as JSON |
| `/address` | `GET`: `getClientAddress()` as text |
| `static/genoacms.txt` | a static file |

The tests build it twice with `vite build`: **A** with defaults, **B** with `precompress: false` and
`envPrefix: 'APP_'`. They serve a build with `functions-framework --target=app --source=<out>/function.js`
on a free port, where `function.js` is the entry the `gcp` target writes (DEP-6) with the export
named `app`, and the environment of each case.

## Non-goals

- No change to any runtime, the deploy procedure or the SvelteKit adapter. A test that fails against
  the real service is a finding, and stops this RFC (discovery rule).
- No contract test for the database: the conformance run (DB-3 to DB-7) already runs in CI once the
  credentials exist.
- No test of the IAM grants in the README (GQ2).
- No deployment of core, and no request through Google's front end: GS5 stays a manual check.
- The Functions Framework's own 404 for `/favicon.ico` and `/robots.txt` (GF20), and `startAfter` being inclusive (GF21): each fix is its own RFC.
- A Playwright suite shared by every deployment target, run with the `gcp` target and later `aws`:
  its own RFC, after `configuration.md` §7 is restructured into statements and core builds in CI.
- Not creating GCP resources: the bucket, the Workload Identity pool and the service account are the
  author's (Steps 1).

## Tests

Contract tests are `packages/adapter-gcp/test/contract/*.test.ts`, level **contract**. End-to-end
tests are `packages/sveltekit-adapter-cloud-run-functions/e2e/adapter.test.js`, level **e2e**.

### Storage (`storage.test.ts`)

- `STO-4: reads an object with its current generation as the version`: given an object the runtime uploaded, when it is read with `getObject`, then the stream yields exactly the uploaded bytes and `version` is the generation the SDK reports for the object, as a decimal string.
- `STO-4: reads a missing object without a version`: given a name with no object, when it is read, then `version` is `undefined` and the stream fails with HTTP 404.
- `STO-6: creates with ifAbsent, and refuses a second create`: given no object, when uploaded with `ifAbsent`, then it exists; when uploaded again with `ifAbsent`, then the upload rejects with `PreconditionFailedError`, message `storage/precondition-failed: <bucket>/<name>: object already exists`, and the content is the first upload's.
- `STO-6: writes on the current version, and refuses a stale one`: given an object read with version *v*, and overwritten with `ifVersion: v`, when uploaded again with `ifVersion: v`, then it rejects with `PreconditionFailedError` and reason `object changed since it was read`, and the content is the second upload's.
- `STO-6: overwrites without a condition`: given an object, when uploaded without options, then the new content is stored.
- `STO-7: moves an object within its bucket, and deletes it`: given an object, when moved to a new name, then the old name has no object and the new one has the content; when deleted, then neither exists.
- `STO-8: serves the object through a URL signed as the test identity`: given an object, when `getSignedURL` is called with an expiry 10 minutes ahead, then the URL has the form of STO-8 with `Expires` equal to the expiry in seconds, and an unauthenticated `GET` of it returns 200 with the object's content.
- `STO-9: lists one level without placeholders or the directory itself`: given `d/a.txt`, `d/.folderPlaceholder`, `d/sub/b.txt` and an object named exactly `d/`, when `d/` is listed, then `files` is exactly `d/a.txt` with its size and a `lastModified` date, and `directories` is exactly `d/sub/`.
- `STO-9: pages a listing with limit and startAfter` (an expected failure, `it.fails`, until GF21 is fixed; STO-9's `Test:` line names `startAfter` as unverified): given `p/1`, `p/2`, `p/3`, when `p/` is listed with `limit: 2`, then `files` is `p/1`, `p/2`; with `startAfter: 'p/2'`, then it is `p/3`.
- `STO-10: creates a directory that its parent's listing shows`: when `createDirectory` creates `e`, then `e/.folderPlaceholder` exists and the listing of the run's prefix names `e/` among `directories`.
- `STO-11: deletes every object under a directory, at every depth, and nothing beside it`: given `f/1`, `f/g/2`, `f/g/h/3` and `fx/4`, when `f/` is deleted, then none of the first three exists and `fx/4` does.
- `STO-12: moves every object under a directory, at every depth`: given `m/1` and `m/n/2`, when `m/` is moved to `moved/`, then `moved/1` and `moved/n/2` hold the contents and no object under `m/` remains.

### Secrets (`secrets.test.ts`)

- `SEC-3, SEC-4: reads a secret that never existed as undefined`: given no secret by the name, when read, then `getSecret` resolves `undefined`.
- `SEC-3: reads back the latest value as UTF-8`: given a secret set to `ž€ genoacms`, when read, then that exact string is returned.
- `SEC-4: propagates the failure to read a disabled latest version`: given a secret whose only version the SDK disabled, when read, then `getSecret` rejects and does not resolve `undefined`.
- `SEC-5, SEC-7: creates a missing secret when overwriting, with automatic replication and a seven-day destroy TTL`: given no secret, when `setSecret` writes it, then it resolves `true`, the value reads back, and the SDK reports automatic replication and `versionDestroyTtl` of 604800 s.
- `SEC-5: overwrites an existing secret`: given a secret, when `setSecret` writes a new value, then the new value reads back.
- `SEC-6, SEC-7: claims an absent key once, and a second claim keeps the first value`: given no secret, when claimed with `a`, then it resolves `true` and the secret has automatic replication and the seven-day TTL; when claimed with `b`, then it resolves `false` and the value is still `a`.
- `SEC-8: leaves only the newest version enabled after overwrites`: given a new secret written three times with `setSecret`, when its versions are listed through the SDK, then exactly one is `ENABLED`, the newest, and the other two are `DISABLED` with a `scheduledDestroyTime` about seven days ahead (GS4).
- `SEC-11: deletes a secret, and reports false for one that does not exist`: given a secret, when deleted, then it resolves `true` and reading it resolves `undefined`; when deleted again, then it resolves `false`.

### Deployment (`deployment.test.ts`, sequential, one function)

- `DEP-8, DEP-9, DEP-10, DEP-12, DEP-13: creates a function that does not exist, with the operator's ADC, and prints its URL`: given no function by the run's name and no `credentials` option, when the procedure deploys the minimal artifact, then it resolves, prints `Function URL: <url>` with an `https` URL, and the SDK reports the function `ACTIVE` with entry point `genoacms`, runtime `nodejs22`, `NODE_ENV=production` and neither `ORIGIN` nor `XFF_DEPTH` among its variables, one maximum instance and ingress `ALLOW_ALL`. The platform adds `LOG_EXECUTION_ID` itself (`deployment.md`, Verification).
- `DEP-9, DEP-10: updates the function that exists`: given that function, when deployed again with `maxInstances: 2`, then it resolves and the SDK reports two maximum instances.
- `DEP-11: fails with deploy/function-failed when the platform cannot build the artifact, and keeps the previous revision`: given an artifact whose `package.json` depends on a package that does not exist, when deployed, then it rejects with a message starting `deploy/function-failed: `, and the SDK still reports the function `ACTIVE` with two maximum instances (GS2).

### COM-3 (`src/*/descriptor.test.ts`, unit)

- The four existing tests carrying COM-3 also assert that `{}` yields exactly `['projectId is required and must be a non-empty string']` (for deployment, among its reasons). Titles unchanged.

### SvelteKit adapter (`e2e/adapter.test.js`)

- `ADP-1, ADP-2: writes client assets, prerendered pages and the runtime files into out, precompressed`: given build A, then `out` holds `client/_app/immutable/`, `prerendered/about.html`, `.gz` and `.br` variants of both, and `env.js`, `handler.js`, `index.js`, `shims.js`.
- `ADP-1: writes no compressed variants without precompress`: given build B, then `out` holds no `.gz` or `.br` file.
- `ADP-3: bundles the server, keeping the app's dependencies external`: given build A, then `server/manifest.js` exports `manifest`, `prerendered` containing `/about`, and `base`, and the server bundle imports `@polka/url` rather than containing it.
- `ADP-4: serves a server-rendered page through the exported handler`: given build A served, when `/` is requested, then it answers 200 with the page's HTML.
- `ADP-5: serves immutable client assets with a one-year cache, precompressed on request`: when an immutable asset is requested with `Accept-Encoding: br`, then it answers 200 with `cache-control: public,max-age=31536000,immutable` and `content-encoding: br`.
- `ADP-5: serves static files and prerendered pages, and redirects the other trailing-slash form with 308`: when `/genoacms.txt` and `/about` are requested, then both answer 200 with their content; when `/about/` is requested, then it answers 308 with `location: /about`.
- `ADP-5: builds the request URL from forwarded headers and passes the body`: when `/echo` receives a JSON `POST` with `X-Forwarded-Proto: https` and `X-Forwarded-Host: cms.example`, then `href` is `https://cms.example/echo` and `body` is the sent body.
- `ADP-5, ADP-7: takes the request URL from ORIGIN over forwarded headers`: given `ORIGIN=https://origin.example`, when the same request is sent, then `href` is `https://origin.example/echo`.
- `ADP-6: returns the X-Forwarded-For entry XFF_DEPTH positions from the right`: given the default depth, when `/address` receives `X-Forwarded-For: 203.0.113.9, 198.51.100.7`, then it answers `198.51.100.7`; given `XFF_DEPTH=2`, then `203.0.113.9`; given `XFF_DEPTH=3`, then it answers 500.
- `ADP-6: falls back to the socket address without X-Forwarded-For`: when `/address` receives no such header, then it answers the loopback address.
- `ADP-7: fails at startup on an XFF_DEPTH that is not a positive integer`: given `XFF_DEPTH=abc`, when served, then the process exits non-zero and its output contains `XFF_DEPTH must be a positive integer, not 'abc'`.
- `ADP-1, ADP-7: reads prefixed variables with envPrefix, and fails at startup on an unknown prefixed one`: given build B with `APP_ORIGIN=https://prefixed.example`, when `/echo` is requested, then `href` starts with it; given also `APP_UNKNOWN=1`, then the process exits non-zero at startup.

## Steps

1. **Author (stop point).** Provide what the contract level needs in CI, and nothing here reads a
   credential: a Workload Identity pool and provider trusting `GenoaCMS/genoacms` on `refs/heads/main`,
   a service account it may impersonate with the IAM needs of the README (runtime and operator,
   including `signBlob` on itself), and the repository variables `GCP_WORKLOAD_IDENTITY_PROVIDER`,
   `GCP_TEST_SERVICE_ACCOUNT`, `GCP_TEST_PROJECT`, `GCP_TEST_BUCKET`, `GCP_TEST_REGION`.
2. Baseline: `node scripts/test-level.mjs unit` passes; `check-results` reports the 31 errors of
   GF15 to GF18 on an undeferred run.
3. Tests, written from the Specification and this RFC. They check existing behavior, so they pass
   without code changes; a failing one is a finding and stops here.
4. `scripts/test-level.mjs`, `ci.yml`, `docs/rfcs/README.md` rule 9, `docs/README.md`.
5. Run §Verification locally with the author's credentials, then in CI on a pull request, then on
   `main`.
6. Update the architecture documents to current (Specification above), and mark this RFC
   implemented.

## Verification

```bash
node scripts/test-level.mjs unit          # passes, as before
node scripts/test-level.mjs e2e           # every ADP test passes, without credentials
GENOACMS_TEST_GCP=1 GENOACMS_TEST_GCP_PROJECT=… GENOACMS_TEST_GCP_BUCKET=… GENOACMS_TEST_GCP_REGION=europe-west3 \
  GOOGLE_APPLICATION_CREDENTIALS=<path> node scripts/test-level.mjs contract   # every STO, SEC, DEP test passes
node docs/tools/check-results.mjs docs unit=… integration=… conformance=… contract=… e2e=…   # 0 errors
node docs/tools/check-docs.mjs docs       # 0 errors
```

Afterwards the bucket holds nothing under `genoacms-contract/`, no secret named `GENOACMS_CONTRACT_*`
exists, and no function named `genoacms-contract-*`.

A falsification audit of the statements whose tests this RFC adds (WORKFLOW §6.3), by an agent that
did not write the tests, recorded as a Verification entry in the README.

## Critique

**Pros**
- Every declared level gets a test at the boundary it names, so `main` can become releasable without lowering a level.
- The contract tests check what the unit tests can only assume: GCS's reading of `ifGenerationMatch`, Secret Manager's destroy TTL, the Functions API's operation errors. GS2, GS3 and GS4 become automated.
- The end-to-end tests need no cloud and also close ADP-1 to ADP-4, untested since GF11.

**Cons & trade-offs**
- Contract runs cost money and several minutes per push to `main`, and fail when Google has an outage, which blocks a release that nothing in the code broke.
- The end-to-end tests pin SvelteKit, Vite and the Functions Framework as dev dependencies of the adapter; their upgrades can break the fixture without breaking the adapter.
- The tests run in production's project (GU6). A defect in a test that escapes its run's names could touch production objects or secrets, and the CI identity holds production grants. Workload Identity Federation limits its use to `main`, but a compromised workflow on `main` could use them.

**Blindspots & missed edge cases**
- STO-11 and STO-12 are tested on a few objects; their unboundedness and partial failure (GF10) stay untested.
- A crashed run leaves objects, secrets or a function behind, since `afterAll` never ran. Names carry the run id, and a manual sweep of the `genoacms-contract` prefixes removes them.
- The Functions Framework locally is not Google's front end: `X-Forwarded-For` as Google writes it stays GS5.
- The deploy tests check the configuration the API reports, not that the function serves requests, because invoking it needs invoker IAM that the procedure does not set.
