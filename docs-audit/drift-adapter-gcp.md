# Drift audit: GCP adapter

- Documents: `docs/architecture/adapter-gcp/` (README, storage, database, secrets, deployment, authentication-identity-platform, authentication-firestore)
- Code: `packages/adapter-gcp`, `packages/sveltekit-adapter-cloud-run-functions`
- Commit audited: `9f43931` (branch `claude/amazing-hamilton-fa37ad`), 2026-10-08
- Method: WORKFLOW §1.6 and §6.3. Each statement was read against its code and the tests it names. Read-only: no code, test or document was changed.

## What was run

| Command | Result |
| :-- | :-- |
| `pnpm install --frozen-lockfile` | ok |
| `pnpm --filter @genoacms/adapter-gcp test` | 138 passed, 30 skipped (all contract and conformance tests: they need `GENOACMS_TEST_GCP=1` and credentials) |
| `pnpm --filter @genoacms/sveltekit-adapter-cloud-run-functions test` | 9 passed (unit only; the e2e suite was not run) |
| `node docs/tools/check-docs.mjs docs` | 0 errors, 5 warnings (all `conforms: false` documents outside this directory) |

**Not run:** the contract tests (`test/contract/*.test.ts`) and the conformance suite (`test/conformance.test.ts`), because they need real Google Cloud credentials. I only reasoned about them. The SvelteKit adapter's e2e suite (`e2e/adapter.test.js`) was not run either. I reasoned about it too.

**Probes.** These were run in the session scratchpad. None of them touched the repository.
- `requestUrl`, `clientAddress` (from `src/request.js`) and Node's `ServerResponse.writeHead`, called directly.
- A one-file function served by `@google-cloud/functions-framework` 5.0.5 on localhost. It echoes `req.url`, `requestUrl(req, ORIGIN)` and whether `rawBody` is set.
- `stageArtifact` and `zipDirectory` from `src/deployment/archive.ts`, run with `node --experimental-strip-types` on a build directory that contains a relative symlink.

## Findings

Severity: **behavior** means the code does something observable that the statement contradicts or does not cover. **test gap** means the named tests pass for code that violates the statement. **editorial** means the text is wrong or misleading, and the behavior is unaffected.

### D1 · ADP-5 · A request path starting with `//` replaces the request URL's host — behavior

- Doc: `docs/architecture/adapter-gcp/deployment.md:284` says "The request URL is `ORIGIN` plus the request path and query when `ORIGIN` is set … Otherwise it is built from `X-Forwarded-Proto` …, then `X-Forwarded-Host`, else `Host`, and the request path."
- Code: `packages/sveltekit-adapter-cloud-run-functions/src/request.js:21` and `:24` resolve `new URL(req.url, base)`. They do not concatenate.
- Observed: the request target `//evil.example/x?y=1` with `ORIGIN=https://cms.example.com` gives `https://evil.example/x?y=1`. Without `ORIGIN` it gives `http://evil.example/x`. In a local Functions Framework 5.0.5 run, `req.url` reached the handler unchanged as `//evil.example/x?y=1`.
- Consequence (inferred, not run end to end): SvelteKit's CSRF check compares the request's `Origin` header with `url.origin`. A page on `evil.example` could post a form to `https://cms.example.com//evil.example/<action>`. Its `Origin` header would equal the computed `url.origin`, so the check would pass, and the route would be `/<action>`.
  - Not verified: whether Google's front end normalizes `//` before the function sees it.
  - For comparison: upstream `@sveltejs/adapter-node` builds the URL as `base + req.url`, which does not have this problem.
- Tests: `tests/request.test.js` and `e2e/adapter.test.js` only use paths that start with a single `/`.
- Options:
  - (a) Code: form the URL by concatenating the origin and the path, as ADP-5's wording implies, and add a regression test that carries ADP-5.
  - (b) Spec: state how a request target starting with `//` is handled, for example rejected with 400.
  - (c) Both: state it, then implement it.

### D2 · ADP-6 · An empty `X-Forwarded-For` returns the socket address instead of throwing — behavior

- Doc: `deployment.md:291` says it "splits `X-Forwarded-For` … drops empty ones … With fewer entries than the depth it throws … Without the header it returns the socket's remote address."
- Code: `src/request.js:36`, `if (!joined) return req.socket?.remoteAddress`.
- Observed:
  - The header present but empty (`X-Forwarded-For:`) returns the socket address.
  - The header holding only `,` throws `XFF_DEPTH is 1, but X-Forwarded-For has 0 entries`.
  - Both have zero entries, so by the statement both should throw. Only a missing header falls back to the socket.
- Options:
  - (a) Code: treat an empty header like any other header with zero entries.
  - (b) Spec: say that an empty header counts as absent.

### D3 · ADP-5 · A Request that cannot be built for reasons other than its URL also answers 400 — behavior (not covered)

- Doc: `deployment.md:284` says "The body is the Functions Framework's `rawBody` … A URL that cannot be parsed answers `400 Bad Request`."
- Code: `src/handler.js:91` passes `body: rawBody ?? null`. `src/handler.js:118` answers 400 for any exception thrown while the `Request` is constructed.
- Observed:
  - The Functions Framework sets `rawBody` on a `GET` that carries a body (local run: `hasRawBody: true`).
  - `new Request(url, { method: 'GET', body })` then throws `TypeError: Request with GET/HEAD method cannot have body.`
  - So such a request answers `400 Bad Request`, although its URL parses. The same happens for any other constructor failure, such as a header value `Request` refuses.
- Options:
  - (a) Spec: state that any request that cannot be represented answers 400, and which cases are included.
  - (b) Code and spec: drop the body for `GET`/`HEAD`, and state it.

### D4 · ADP-5 and ADP-7 · Edge cases with a missing host and an empty `ORIGIN` — behavior (not covered)

- Doc: `deployment.md:284` (ADP-5) and `deployment.md:298` (ADP-7: "`ORIGIN` is used as given, and unset means none").
- Code: `src/request.js:21-24` and `src/env.js:29`.
- Observed:
  - A request with neither `X-Forwarded-Host` nor `Host` gets the URL `http://undefined/<path>`, not a 400.
  - `ORIGIN` set to the empty string counts as set (`prefixed in process.env`). Every request then fails URL parsing and answers 400. The function starts normally, so the misconfiguration only appears per request.
  - An `ORIGIN` that is not a URL behaves the same way.
- Options:
  - (a) Spec: state these outcomes as they are.
  - (b) Code and spec: answer 400 when there is no host, and validate `ORIGIN` at startup like `XFF_DEPTH`, so it fails at start.

### D5 · ADP-5 · The 308 `Location` is the decoded path; a non-Latin-1 path throws — behavior (not covered)

- Doc: `deployment.md:284` says "redirecting with 308 to the path with the trailing slash added or removed when only that variant is prerendered". It does not say how the path is encoded.
- Code: `src/handler.js:62` decodes the pathname, and `src/handler.js:74` writes it as `Location`.
- Observed:
  - `res.writeHead(308, { location: '/č' })` throws `ERR_INVALID_CHAR`. So a request for `/%C4%8D/`, where `/č` is prerendered, throws inside the middleware instead of redirecting. The resulting status was not observed; it is probably the framework's 500.
  - Characters that Node does accept, such as a space, are sent unencoded in `Location`.
  - Upstream adapter-node has the same code.
- Options:
  - (a) Code and spec: re-encode the path before writing `Location`, and state the encoding.
  - (b) Spec: record that prerendered paths outside Latin-1 cannot be redirected.

### D6 · DB-7 · `updateDocument` reads dotted keys as field paths; `createDocument` does not — behavior (not covered)

- Doc: `database.md:102` says "`updateDocument(ref, data)` is Firestore's `update`: a merge of the given fields."
- Code: `packages/adapter-gcp/src/database/runtime.ts:65` calls `.update(document)`. Creation uses `.add(data)`.
- Behavior, from Firestore's reference documentation and not run:
  - `update` reads a top-level key containing `.` as a path into nested maps. `add` stores it as a literal field name. So a document created with a field `a.b` and then updated with `{ 'a.b': … }` gets a nested `a: { b: … }` instead.
  - A nested map in the update replaces that field as a whole. Only the top level is merged.
- Tests: `src/database/runtime.test.ts:73` mocks `update`, so it shows neither effect.
- Options:
  - (a) Spec: state both effects as part of DB-7.
  - (b) Code and spec: update with `set(…, { merge: true })` or escaped field paths, and state the chosen semantics.

### D7 · DB (no statement) · The Firestore runtime ignores `ctx.resources` — behavior (not covered)

- Code: `src/database/runtime.ts:15`. `create` never reads `ctx`. Every collection name reaches Firestore, whatever resources are bound.
- Comparison: storage refuses unbound buckets (STO-3, `src/storage/runtime.ts:53-56`). `contracts/adapter-model.md:186` says the resources are "database names for a database".
- No DB statement says whether the bound resources are checked, or why not.
- Options:
  - (a) Spec: add a statement that the database runtime does not check resources, with its reason.
  - (b) Code and spec: check them, as STO-3 does.

### D8 · DEP-11 · A failing create or update call is not reported as `deploy/function-failed` — behavior (not covered)

- Doc: `deployment.md:211` says "The procedure awaits the operation. A failed operation throws `deploy/function-failed: …`."
- Code: `src/deployment/functions.ts:72-74`. A rejection of `createFunction` or `updateFunction` itself (permission denied, invalid argument, a conflict with a running operation, GD1's *Cost:*) propagates unwrapped. Only a failure of `operation.promise()` is wrapped (`functions.ts:60`).
- Options:
  - (a) Spec: state that only an operation failure is wrapped and other call errors propagate unchanged, as DEP-9 says for the lookup.
  - (b) Code and spec: wrap both.

### D9 · DEP-2 · `functionName` is not validated — behavior (not covered)

- Doc: `deployment.md:139` gives "`functionName?: string`, default `genoacms`".
- Code: `src/deployment/descriptor.ts:30` only lists the key as allowed. `src/deployment/procedure.ts:15` uses it as given.
- Effect: `functionName: ''` or `functionName: 5` passes `genoa build`'s validation. The error appears only at deploy time, from the Functions API, or not at all when the name is coerced. Every other option with a type is validated.
- Options:
  - (a) Code and spec: validate it, for example as a non-empty string matching the platform's function-ID rule, with its own reason.
  - (b) Spec: state that it is not validated.

### D10 · DEP-6 and DEP-7 · Staging rewrites relative symlinks, so the archive holds links pointing outside it — behavior (low impact)

- Doc: `deployment.md:176` says "Copy the build directory to `<workDir>/app`". `deployment.md:183` says "exactly the staged directory … no symlink following".
- Code: `src/deployment/archive.ts:31` calls `cp(buildDir, app, { recursive: true })`, whose default is `verbatimSymlinks: false`. `archive.ts:45` stores links as links.
- Observed: `build/link.txt -> vendor/real.txt` was staged as an absolute link into `buildDir`, and stored in the zip as `link.txt -> ../../build/vendor/real.txt`. That target lies outside the uploaded root, so the link is broken on GCP.
- Impact: `build.md` D9's artifact holds tarballs and normally has no symlinks, so this is latent.
- Options:
  - (a) Code: copy with `verbatimSymlinks: true`.
  - (b) Spec: refuse symlinks in the artifact and state it.
  - (c) Spec: state the current behavior.

### D11 · STO-3 · Only `getObject` is tested, and "before any request" is not asserted — test gap

- Doc: `storage.md:101` says "**Every** method first checks the reference's bucket … before any request."
- Test: `packages/adapter-gcp/src/storage/runtime.test.ts:119` covers only `getObject`.
- A runtime where any of the other nine methods skips the check, or checks after its SDK call, passes. For example, `moveDirectory` could list first.
- Options:
  - (a) Tests: one case per method, asserting that the rejection comes with no SDK call.
  - (b) Spec: narrow the statement to what is tested.

### D12 · STO-8 · The tests pass a number; the contract passes a `Date` — test gap and editorial

- Doc: `storage.md:136`, `Expires=<floor(expires / 1000)>`, does not name the type of `expires`.
- Contract: `packages/contracts/src/storage/adapter.d.ts:11` types it `expires: Date`. Core passes a `Date` (`packages/core/src/lib/script/storage/storage.server.ts:92`).
- Tests: `src/storage/urls.test.ts:48`, `:60` and `test/contract/storage.test.ts:113` all pass `Date.now() + …`, a number. The path core actually uses is untested at every level.
- Options:
  - (a) Tests: pass a `Date`.
  - (b) Spec: name the type, and state how a `Date` maps to `Expires`.

### D13 · DB-3 to DB-7 · The contract level proves less than the statements, beyond GF31 — test gap

- Doc: `database.md:72-105`. The only contract-level test is `packages/adapter-gcp/test/conformance.test.ts`, which runs `packages/conformance/src/database.js`.
- What the suite cannot catch:
  - **DB-3:** the suite reads back through the same adapter. An adapter that prefixes or maps collection names passes, because nothing reads the real Firestore collection by its name.
  - **DB-6:** `undefined` for a missing document is never requested at the contract level.
  - **DB-7:** "deleting a missing document is not an error" is tested at no level. The unit mock (`src/database/runtime.test.ts:24`) always resolves, and the suite deletes an existing document. Errors of `deleteDocument` are not tested at the unit level either.
  - **DB-5:** "ordered by document ID" is checked only by replaying the mock's order (`runtime.test.ts:73`).
- Options:
  - (a) Tests: GCP contract tests of its own for DB-3 to DB-7 that read and write through the SDK, as AWS has (CF7 notes this).
  - (b) Tests: extend the conformance suite with CF7.
  - (c) Spec: lower the levels or mark the parts `unverified`.

### D14 · SEC-5, SEC-6, SEC-8, SEC-9 and the Runtime preamble · Parts of statements untested — test gap

All in `docs/architecture/adapter-gcp/secrets.md` and `src/secrets/runtime.test.ts`:
- **Runtime preamble (`secrets.md:92-93`):** "every method validates `key` with `assertValidSecretKey` before any call". This normative sentence has no ID and no test. Dropping the check passes every test.
- **SEC-5 (`:118`):** "runs SEC-8 when the added version has a name". The branch where the version has no name is never exercised.
- **SEC-6 (`:125`):** "On success it adds the version". No unit test asserts the `addSecretVersion` call or its payload for a claim (`runtime.test.ts:134` asserts only `true`). The contract test covers it by reading the value back.
- **SEC-8 (`:139`):** "in list order". The test lists versions 1, 2, 3, 4, so list order and numeric order coincide, and an implementation that sorts first passes.
- **SEC-9 (`:146`):**
  - only the prefix `secrets/cleanup-failed: KEY:` is asserted;
  - the text `secrets/unexpected-version-name: <name>` is never asserted;
  - a version name that is not numbered and comes **before** a lower enabled version (cleanup stops part-way) is not covered.
- Options:
  - (a) Tests: add these cases.
  - (b) Spec: give the preamble sentence an ID, or turn it into a statement.

### D15 · DEP-4, DEP-6, DEP-7, DEP-8, DEP-10, DEP-14 · Parts of statements untested — test gap

- **DEP-6 (`deployment.md:176`, `:237-246`):**
  - `src/deployment/archive.test.ts:42` compares `function.js` with the code's own `FUNCTION_ENTRY` constant, not with the Specification's byte-for-byte block. The two are identical today, but a change to the constant would pass.
  - The `deploy/no-runtime-package` message is checked only by its prefix (`:49`).
- **DEP-7 (`:183`):** neither "level 9" nor "no symlink following" is tested (`archive.test.ts:52`).
- **DEP-4 and DEP-14 (`:160`, `:232`):**
  - "in DEP-3's key order" is never tested with two invalid settings;
  - "their reasons follow DEP-4's, before the instance-order rule" is not tested;
  - the first test in `settings.test.ts` carries no ID.
- **DEP-8 (`:190`):** "nothing else is called". `procedure.test.ts:74` asserts only that `createFunction` was not called, not `getFunction` or `updateFunction`.
- **DEP-10 at the e2e level (`:206-207`):** the named e2e test (`packages/sveltekit-adapter-cloud-run-functions/e2e/adapter.test.js:370-371`) sets `IGNORED_ROUTES: ''` itself. It shows GD8's premise, the framework's behavior, not the procedure's request. The e2e level of DEP-10 is therefore not tested against the deploy.
- Options:
  - (a) Tests: add these cases.
  - (b) Spec: drop `e2e` from DEP-10's levels and move the e2e test under GD8 or ADP-5.

### D16 · COM-4 · Its tests do not cover the providers it claims — test gap

- Doc: `README.md:279-284` says "Each provider construction … `credentials` is optional on **every** descriptor, … passed to the client only when given."
- Tests: COM-4's list covers storage, database and secrets.
  - Secrets is tested only without credentials (`src/secrets/runtime.test.ts:50`).
  - The Identity Platform runtime checks the credentials path (`src/authentication/identity-platform/runtime.test.ts:83-88`) but carries no COM-4 and is not listed.
  - The deployment client is tested under DEP-13 only.
- Options:
  - (a) Tests: add the missing cases and IDs, and list the files.
  - (b) Spec: narrow COM-4 to the services it is tested for.

### D17 · ADP preamble · Stale text about how ADP-1 to ADP-4 are verified — editorial

- Doc: `deployment.md:250-252` says "ADP-1 to ADP-4 and the handler's wiring are not unit-tested … The production build, which bundles them, and the live deploy exercise them."
- Since RFC-0025, `e2e/adapter.test.js` covers them at the `e2e` level, which their `Level:` lines declare. The sentence still describes the state before RFC-0025 (GF18).
- Option: name the e2e suite there.

### D18 · Identity Platform setup · The API key reads as an alternative to the IAM grant — editorial

- Doc: `authentication-identity-platform.md:60` says "either an IAM grant on the runtime identity that permits `signInWithPassword` …, or an API key".
- But AUTH-10 (`:177`) and the code (`src/authentication/identity-platform/runtime.ts:171`) always use an ADC token for `accounts:lookup`, even when a key is configured.
- An operator who takes the "API key" branch without a grant can sign in, but every `getIdentity` then fails as a provider failure. README's IAM row (`README.md:124`) words it correctly ("an API key for signing in").
- Option: say in the setup list that the lookup needs the IAM grant either way.

### D19 · STO-3 · Error text differs from the adapter model's example — editorial

- Doc: `storage.md:101` and the code (`src/storage/runtime.ts:56`) give `bucket-unregistered`.
- `docs/architecture/contracts/adapter-model.md:278`, which is `conforms: false`, shows `bucket-unregistered: <name> is not bound to <ctx.name>` in its example of this very adapter.
- README says the GCP document wins on GCP details, so no behavior is wrong. The example is stale.
- Options:
  - (a) Correct the example.
  - (b) Adopt the more informative message through an RFC.

### D20 · README · "planned as two adapters" — editorial

- Doc: `README.md:76` says "plus authentication, planned as two adapters".
- One of the two is implemented and current (AUTH-1 to AUTH-10, `README.md:86`). Only the Firestore store is **New**.
- Option: reword the sentence.

## Existing findings

| ID | Recorded state | Checked | Result |
| :-- | :-- | :-- | :-- |
| GF9 | open | `src/database/runtime.ts` `getCollection`: a single `.get()` with no limit | still accurate |
| GF31 | open, fixed with CF7 | `packages/conformance/src/database.js:14,51` still reassigns `documentData` at collection time; `:93` checks only `toBeInstanceOf(Array)`; `test/conformance.test.ts` is still DB-5's and DB-7's only contract test | still accurate. D13 shows that DB-3 and DB-6 are affected too |
| GF8 | documented; GS3 not run | the signed URL still comes from the client library with no key option under ADC | still accurate (GS3 not run) |
| GF27 | documented | `test/contract/secrets.test.ts:10,70` polls for 30 s | still accurate |
| GF1, GF2, GF6 | fixed, RFC-0021 | `functions.ts`: operation awaited, `response.ok` checked, only `NOT_FOUND` counts as absent | fixed |
| GF3 | fixed | `settings.ts`: options with the stated defaults | fixed |
| GF4 | fixed | README IAM section present | fixed |
| GF5 | fixed | `secrets/runtime.ts` cleanup present | fixed |
| GF7, GF14 | fixed, RFC-0023 | `request.js` takes the entry by depth; `handler.js` imports `ENV` | fixed (D2 notes a remaining edge) |
| GF10, GF29 | fixed, RFC-0027 | `deleteAtMost`, page by page; the move lists first, then moves sequentially | fixed |
| GF11 | fixed | the adapter's `test` script runs `vitest run`; 9 tests pass | fixed |
| GF12, GF13 | fixed, RFC-0024 | unit tests exist for STO-4 to STO-12 and DB-3 to DB-7 | fixed (see D11 and D13 for what remains) |
| GF15 to GF18 | fixed, RFC-0025 | contract and e2e test files exist and carry the IDs | present; not run here |
| GF19, GF24, GF25, GF26 | fixed | each listed case now has a test (checked case by case) | fixed |
| GF20 | fixed | `IGNORED_ROUTES: ''` in `settings.ts` | fixed |
| GF21, GF22 | fixed | `startAfter` is skipped and `limit + 1` requested; the move name is concatenated literally | fixed |
| GF23 | fixed | no `static/` middleware in `handler.js` | fixed |
| GF28 | fixed | DB-3's reason corrected | fixed |
| GF30 | fixed | each listed mutation now has a test that catches it | fixed |
| GF32, GF33 | fixed, RFC-0032 | `signedIn`/`foundIn` raise `malformed response`; 38 unit tests | fixed |

The `verified` commits are consistent with the code:
- `aa17eb9` (README, storage, secrets, deployment): since that commit, only the Identity Platform files and the authentication conformance suite changed in the audited packages.
- `b050b3b` (database): nothing database-related changed since.
- `ce0ab39` (Identity Platform): no code changed since.

## Summary

| # | Statement | Severity | Mismatch in brief |
| :-- | :-- | :-- | :-- |
| D1 | ADP-5 | behavior | a `//host/…` path replaces the request URL's host, with or without `ORIGIN` (possible CSRF bypass) |
| D2 | ADP-6 | behavior | an empty `X-Forwarded-For` returns the socket address instead of throwing |
| D3 | ADP-5 | behavior | a GET or HEAD with a body, or any `Request` constructor error, answers 400 |
| D4 | ADP-5, ADP-7 | behavior | no host gives `http://undefined`; an empty `ORIGIN` gives 400 on every request |
| D5 | ADP-5 | behavior | the 308 `Location` is the decoded path; a non-Latin-1 path throws |
| D6 | DB-7 | behavior | dotted keys are field paths in `update`, literal in `add` |
| D7 | (none) | behavior | the database runtime ignores `ctx.resources` |
| D8 | DEP-11 | behavior | a rejected create or update call is not `deploy/function-failed` |
| D9 | DEP-2 | behavior | `functionName` is not validated |
| D10 | DEP-6, DEP-7 | behavior | relative symlinks become broken links in the zip |
| D11 | STO-3 | test gap | 1 of 10 methods tested; "before any request" not asserted |
| D12 | STO-8 | test gap, editorial | tests pass a number; the contract and core pass a `Date` |
| D13 | DB-3 to DB-7 | test gap | the contract level cannot show name mapping, a missing read, or a missing delete |
| D14 | SEC-5, SEC-6, SEC-8, SEC-9, preamble | test gap | key validation, nameless version, claim payload, list order, warning text |
| D15 | DEP-4, DEP-6, DEP-7, DEP-8, DEP-10, DEP-14 | test gap | self-referential entry check, zip level and symlinks, reason order, e2e not of the deploy |
| D16 | COM-4 | test gap | Identity Platform and secrets-with-credentials not under COM-4 |
| D17 | ADP preamble | editorial | says the ADP statements are exercised only by the build and live deploy |
| D18 | GD2 setup | editorial | the API key reads as an alternative to the IAM grant, but the lookup always needs the grant |
| D19 | STO-3 | editorial | the adapter model's example shows another message |
| D20 | README | editorial | "planned as two adapters" |

## Statements checked with no drift

- COM-1, COM-2, COM-3
- STO-1, STO-2, STO-4, STO-5, STO-6, STO-7, STO-9, STO-10, STO-11, STO-12
- DB-1, DB-2, DB-4 (DB-3, DB-5 and DB-6 only have the test gaps of D13)
- SEC-1, SEC-2, SEC-3, SEC-4, SEC-7, SEC-10, SEC-11
- DEP-1, DEP-3, DEP-5, DEP-12, DEP-13
- ADP-1, ADP-2, ADP-3, ADP-4
- AUTH-1 to AUTH-10. They were checked in full against the code and their test titles. The two audits GS11 and GS12 covered them recently, and nothing new was found.
- FAUTH-1 to FAUTH-4 are all `new (no RFC yet)`. No code or export exists, which is consistent.
