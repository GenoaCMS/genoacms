---
type: rfc
number: 32
title: The Identity Platform authentication adapter
status: implemented
commits: [51475a5, e97641d, 7448d92, f9f652b, ce0ab39]
depends: [30]
architecture: [architecture/adapter-gcp/authentication-identity-platform.md, architecture/adapter-gcp/README.md]
changes: [AUTH-1 added, AUTH-2 added, AUTH-3 added, AUTH-4 added, AUTH-5 added, AUTH-6 added, AUTH-7 added, AUTH-8 added, AUTH-9 added, AUTH-10 added]
commit-subject: "feat(adapter-gcp): the Identity Platform authentication adapter (AUTH-1 to AUTH-10)"
---

# RFC-0032: The Identity Platform authentication adapter

## Summary

On GCP, users sign in against an array of plain-text passwords in a JSON secret (CF2). GD2 decided
that Identity Platform, or plain Firebase Authentication (GU10), authenticates instead, so GenoaCMS
stores no password material there. GU11 lets this RFC be written from Google's reference
documentation before GS1 runs; GS1 then confirms it, and a contradiction reopens the statement.

This RFC adds `@genoacms/adapter-gcp/authentication/identity-platform` and its runtime:

1. a descriptor with `projectId`, `tenantId`, `apiKey` and `credentials` (AUTH-1);
2. `authenticate` as one `accounts:signInWithPassword` call, mapped onto RFC-0030's contract (AUTH-2 to AUTH-8);
3. `getIdentity` as one `accounts:lookup` call (AUTH-10), and no management capability (AUTH-9);
4. contract tests against `genoacms`'s Firebase Authentication, with throwaway users, including the CONF-4 suite.

## Files

**Modify or create only:**

| File | Change |
| :-- | :-- |
| `packages/adapter-gcp/src/authentication/identity-platform/descriptor.ts` | create |
| `packages/adapter-gcp/src/authentication/identity-platform/runtime.ts` | create |
| `packages/adapter-gcp/src/authentication/identity-platform/descriptor.test.ts`, `runtime.test.ts` | create |
| `packages/adapter-gcp/test/contract/authentication.test.ts` | create |
| `packages/adapter-gcp/package.json`, `pnpm-lock.yaml` | the two exports; dependency `google-auth-library` `^9.15.1`, already installed through the client libraries |
| `.github/workflows/ci.yml` | the contract step sets `GENOACMS_TEST_GCP_IDENTITY: '1'` (step 6, after the author's grant) |
| `docs/architecture/adapter-gcp/authentication-identity-platform.md`, `README.md` | statements current, the IAM rows (step 7) |

## Specification

AUTH-1 to AUTH-10 stand as written in `authentication-identity-platform.md`. The implementation:

- **Descriptor.** `secretOptions: { apiKey: 'string', credentials: 'json' }`. `validate` returns COM-2's reasons, COM-3's for `projectId`, then `tenantId must be a non-empty string` for a present `tenantId` that is not one. The options type registers in `AuthenticationAdapters` under the specifier.
- **Construction.** One `GoogleAuth` per provider (COM-4): `{ scopes: ['https://www.googleapis.com/auth/identitytoolkit'], projectId }`, plus `credentials` when given. Nothing is fetched at construction.
- **Requests.** One `AbortSignal.timeout(10_000)` per call, created before the ADC token is requested. The token request races it, and `fetch` (`method: 'POST'`, `content-type: application/json`, the JSON body of AUTH-2 or AUTH-10) and reading the body take it as `signal`. A request with a token carries `authorization: Bearer <token>`. Nothing is retried.
- **Token.** A token that resolves to anything but a non-empty string fails with `authentication/provider-failed: network no access token`.
- **Bodies.** The body is read as text, then parsed. A read that fails is `network` with the error's message. A `200` body that does not parse to a JSON object (not `null`, not an array) fails with `authentication/provider-failed: 200 malformed response`. Any other status reads a body that does not parse as having no `error.message`, so the message is empty: `authentication/provider-failed: 502 `.
- **Responses.** As AUTH-3 to AUTH-7 and AUTH-10. A `200` sign-in without a non-empty string `localId` and `email` is `200 malformed response` (AUTH-3), and so is a lookup whose `users` is present but not an array, or whose first entry lacks a non-empty string `localId` (AUTH-10). The identity is built from the strings as they are, never with `String()`. The error code is `error.message` split on ` : `, first part. `USER_DISABLED` is `credentials` (AUTH-5, until GS1b). `<status>` is the HTTP status, or `network` for a rejected `fetch` and for a token `GoogleAuth` cannot provide.
- **Tokens.** The response's `idToken` and `refreshToken` are never read (AUTH-8). The adapter logs nothing.

**IAM**, from Google's documentation, confirmed by GS1a and GS1f:

| Identity | Needs | Role |
| :-- | :-- | :-- |
| runtime | look users up (`firebaseauth.users.get`), and, without an API key, call `signInWithPassword` with its token | `roles/firebaseauth.viewer` |
| CI (contract tests) | create, update and delete users | `roles/firebaseauth.admin` |

## Non-goals

- GS1 itself: run once the author has enabled email/password sign-in and given the agent a usable credential (GU10).
- `disabled` for `USER_DISABLED`: a new RFC, if GS1b shows that Identity Platform reports it only for a correct password.
- Second factors, password reset, user management (AUTH-9).
- Switching `packages/core/genoa.config/production.ts` to this adapter: the author's change, with `authorization.ts`'s seed administrator moved to the user's Identity Platform UID (GD2's cost).
- The Firestore store (`identities.md` IU6).

## Tests

**`src/authentication/identity-platform/descriptor.test.ts`** (unit):
- `AUTH-1: names its runtime, decodes the API key as a string and credentials as JSON`.
- `AUTH-1, COM-2, COM-3: accepts a project and an optional tenant, and refuses unknown keys, a missing project and an empty tenant`: *given* `{ projectId }`, all four options, an extra key, `{}`, `tenantId: ''` and `tenantId: 7`, *then* no reason, no reason, `unknown option 'extra'`, the COM-3 reason, and `tenantId must be a non-empty string` twice.

**`src/authentication/identity-platform/runtime.test.ts`** (unit), `fetch` and `GoogleAuth` replaced:
- `AUTH-2: makes one POST to signInWithPassword, with the API key as key and no token`: *then* one request, that URL, `key`, no `authorization`, the body `{ email, password, returnSecureToken: true }`.
- `AUTH-2: without an API key, carries an ADC token with the identitytoolkit scope`: *then* no `key`, `Bearer <token>`, and `GoogleAuth` constructed with the scope, the project and the given credentials.
- `AUTH-2: sends the tenant when configured`.
- `AUTH-2, AUTH-7: abandons a call after 10 seconds and fails as a provider failure`: *given* a fetch that rejects with a `TimeoutError`, *then* `AbortSignal.timeout(10000)` was used and the error starts `authentication/provider-failed: network`.
- `AUTH-3: a 200 returns the subject and email it carries`.
- `AUTH-4: a pending second factor is rejected as second-factor-required`.
- `AUTH-5: every credential error code is rejected for credentials, suffix or not`: each of the six codes, bare and with ` : <detail>`.
- `AUTH-6: too many attempts throws authentication/throttled`: with a suffix.
- `AUTH-7: any other outcome throws a provider failure with its status and message`: `400 API_KEY_INVALID`, `400 MISSING_RECAPTCHA_TOKEN`, `403 PERMISSION_DENIED`, a `502` HTML body, a rejected fetch.
- `AUTH-7: an ADC token that cannot be obtained is a provider failure, and nothing is sent`.
- `AUTH-8: the tokens of the response are neither returned nor logged`: *given* a response with `idToken` and `refreshToken`, *then* the result does not contain them and no console method was called.
- `AUTH-9: offers no management capability`: the instance's keys are exactly `authenticate` and `getIdentity`.
- `AUTH-10: makes one POST to accounts:lookup with the project and tenant, carrying an ADC token even with an API key`.
- `AUTH-10: returns null for no entry, a disabled entry and an entry without an email`.
- `AUTH-10: any other outcome throws as a provider failure`.

**Added after GS11** (GF32, GF33), unit, in the same files. Each asserts an error by its whole message,
never a substring.

`descriptor.test.ts`:
- `AUTH-1, COM-2: refuses every key but its four, and a null tenant`: *given* `region`, `apiKeys` and `tenant` each beside `projectId`, and `tenantId: null`, *then* `unknown option '<key>'` for each, and `tenantId must be a non-empty string`.
- `AUTH-1: the package exports the descriptor and the runtime under their specifiers`: *given* `package.json`, *then* `exports['./authentication/identity-platform'].import` is `./dist/authentication/identity-platform/descriptor.js` and `exports['./authentication/identity-platform/runtime'].import` is `./dist/authentication/identity-platform/runtime.js`.

`runtime.test.ts`:
- `AUTH-2: sends the JSON content type with and without an API key`: *then* both requests carry `content-type: application/json`.
- `AUTH-2, AUTH-7: a network error or a 5xx is not retried`: *given* a rejected fetch, then a `503`, *then* each fails as a provider failure after exactly one request.
- `AUTH-2, AUTH-7: the 10-second limit covers the ADC token`: *given* `AbortSignal.timeout` replaced by a signal the test aborts with a `TimeoutError`, and a token request that never settles, *when* the test aborts, *then* `authenticate` and `getIdentity` reject with `authentication/provider-failed: network <the TimeoutError's message>` and nothing was sent.
- `AUTH-2, AUTH-7: the request and the body read share the 10-second signal`: *given* the same replaced signal, *then* `fetch` receives exactly it; *given* a `200` whose body read rejects with a `TimeoutError` after the headers, *then* both methods reject with `authentication/provider-failed: network <its message>`.
- `AUTH-3: the subject and email come from the response, not the request`: *given* `Ada@Example.com` in the request and `ada@example.com` in the response, *then* the identity carries `ada@example.com`.
- `AUTH-3, AUTH-7: a 200 without a usable body is a provider failure`: *given* `200` bodies of HTML, `{}`, `null`, `[]`, no `localId`, no `email`, `localId: 7` and `email: ''`, *then* each rejects with exactly `authentication/provider-failed: 200 malformed response`.
- `AUTH-4: a second factor is recognised by mfaPendingCredential alone`: *given* a `200` with `mfaInfo` but no `mfaPendingCredential`, *then* an identity; with `mfaPendingCredential` alone, *then* `second-factor-required`.
- `AUTH-5, AUTH-7: the error code is the message up to " : ", compared exactly`: *given* `400` with `INVALID_PASSWORD extra`, `INVALID_PASSWORD:extra`, `INVALID_PASSWORDS`, `OPERATION_NOT_ALLOWED` and `INVALID_ID_TOKEN`, *then* each is a provider failure, with the whole message.
- `AUTH-7: the message is the status and the response's message, and nothing else`: *then* `403 PERMISSION_DENIED` rejects with exactly `authentication/provider-failed: 403 PERMISSION_DENIED`, and a `502` HTML body with exactly `authentication/provider-failed: 502 `.
- `AUTH-8: no property of the result holds a token, and nothing is written anywhere`: *given* a response with `idToken` and `refreshToken`, *then* no own key of the result, enumerable or not, and nothing on its prototype holds either value, and no function of `console`, `process.stdout.write` or `process.stderr.write` was called.
- `AUTH-9: management is not reachable on the instance`: *then* `'management' in adapter` is `false`.
- `AUTH-10, AUTH-7: a 200 without a usable body is a provider failure`: *given* `200` bodies of HTML, `null`, `[]`, `{ users: {} }`, an entry without `localId` and one with `localId: ''`, *then* each rejects with exactly `authentication/provider-failed: 200 malformed response`; *given* `{}` and `{ users: [] }`, *then* `null`.
- `AUTH-10, AUTH-7: a failed lookup never returns null`: *given* a `400`, a `404`, a rejected fetch and an ADC token that cannot be obtained, *then* each rejects with a provider failure, after at most one request.

**Added after GS12**, unit, in `runtime.test.ts`, asserting whole messages as above:
- `AUTH-10, AUTH-7: a 5xx lookup is a provider failure with its status, sent once`: *given* `503 UNAVAILABLE`, *then* exactly `authentication/provider-failed: 503 UNAVAILABLE`, after one request.
- `AUTH-2, AUTH-10: a call that times out is not sent again`: *given* a fetch that rejects with a `TimeoutError`, *then* each method rejects with `authentication/provider-failed: network <its message>` after exactly one request.
- `AUTH-10: the lookup has the 10-second limit and the JSON content type`: *then* `AbortSignal.timeout` was called with `10000` and the request carries `content-type: application/json`.
- `AUTH-7: the message is the error's own, without its cause`: *given* a fetch that rejects with `TypeError('fetch failed', { cause: Error('ECONNREFUSED') })`, *then* exactly `authentication/provider-failed: network fetch failed`.
- `AUTH-7: a provider failure keeps the whole response message`: *given* `400` with `OPERATION_NOT_ALLOWED : Password sign-in is disabled`, *then* exactly `authentication/provider-failed: 400 OPERATION_NOT_ALLOWED : Password sign-in is disabled`.
- `AUTH-3, AUTH-7: an empty localId or a non-string email is malformed`: *given* `200` with `localId: ''`, then with `email: 7`, *then* each rejects with exactly `authentication/provider-failed: 200 malformed response`.
- `AUTH-3: the email is the response's, as it is`: *given* `ada@example.com` in the request and `Ada.Lovelace@Example.org` in the response, *then* the identity's email is `Ada.Lovelace@Example.org`.
- `AUTH-2, AUTH-7: an ADC token that resolves empty is a provider failure, and nothing is sent`: *given* `getAccessToken` resolving `null`, `undefined` and `''`, *then* each sign-in without an API key rejects with exactly `authentication/provider-failed: network no access token`, and no request was sent.
- `AUTH-10, AUTH-7: a null users, a null entry, or a disabled entry without localId is malformed`: *given* `{ users: null }`, `{ users: [null] }` and `{ users: [{ disabled: true, email: 'ada@example.com' }] }`, *then* each rejects with exactly `authentication/provider-failed: 200 malformed response`.
- `AUTH-4: a null mfaPendingCredential still requires the second factor`: *given* a `200` with `localId`, `email` and `mfaPendingCredential: null`, *then* `{ rejected: 'second-factor-required' }`.

**`test/contract/authentication.test.ts`** (contract), only with `GENOACMS_TEST_GCP=1` and `GENOACMS_TEST_GCP_IDENTITY=1`. At load it creates two throwaway users in `GENOACMS_TEST_GCP_PROJECT` (`<name>-<run id>@genoacms-contract.example.com`, random passwords), the second disabled, through `projects/<project>/accounts`; it deletes both afterwards.
- `AUTH-2, AUTH-3: signs a user in with the runtime identity`.
- `AUTH-5: a wrong password, an unknown email and a disabled user are rejected for credentials`.
- `AUTH-7: an invalid API key is a provider failure, not a rejection`.
- `AUTH-10: looks a user up, and finds neither an unknown nor a disabled one`.
- `CONF-4: Identity Platform conformance`: the suite with both users.

AUTH-4 (a second factor) and AUTH-6 (throttling) cannot be provoked against the real service without
enrolling a factor or tripping the project's abuse protection for every user. As GU5 did for SEC-9 and
SEC-10, their level is `unit` only (GU12, decided by the author).

## Steps

1. Baseline: RFC-0030 implemented; `node scripts/test-level.mjs unit` passes.
2. Tests from this RFC, marked `it.fails`, committed: `test(adapter-gcp): the Identity Platform adapter's tests, expected to fail until implemented (RFC-0032)`.
3. The descriptor, the runtime, the exports and the dependency. Remove the markers; run §Verification.
4. **Stop point for the author:** enable email/password sign-in in `genoacms`'s Firebase Authentication, and grant the CI identity `roles/firebaseauth.admin` and the runtime identity `roles/firebaseauth.viewer`.
5. Run the contract test once by hand with a credential the agent may use (GU10), together with GS1; record GS1.
6. CI's contract step sets `GENOACMS_TEST_GCP_IDENTITY: '1'`.
7. Documents, separately: AUTH-1 to AUTH-10 current with their test files and levels as decided; the IAM rows; `verified`; GD2 current; this RFC `implemented`.
8. A falsification audit of AUTH-1 to AUTH-10, recorded as a `GS` entry. *Done:* GS11, which found GF32 and GF33; this RFC was amended for them before step 7, which therefore moves after step 11.
9. GS11's tests (§Tests, *Added after GS11*), marked `it.fails`, committed: `test(adapter-gcp): GS11's regression tests for the Identity Platform adapter, expected to fail until fixed (RFC-0032)`. A test that already passes keeps no marker.
10. The fix: remove the markers; run §Verification. `fix(adapter-gcp): a 200 without a usable body is a provider failure, and the 10-second limit covers the ADC token (GF32, GF33)`.
11. A falsification audit of AUTH-2, AUTH-3, AUTH-7 and AUTH-10 as amended, recorded as a `GS` entry; then step 7, with GF32 and GF33 fixed, RFC-0032.
12. *Done:* GS12 found no defect, and test gaps and three ambiguities in AUTH-10 and AUTH-4, which the author settled. AUTH-2, AUTH-4 and AUTH-10 were clarified and the tests *Added after GS12* added, passing without markers: `test(adapter-gcp): GS12's regression tests for the Identity Platform adapter (RFC-0032)`. No further audit: what passes is unobservable from Google's service.

## Verification

```bash
pnpm --filter @genoacms/adapter-gcp run build
# builds; dist/authentication/identity-platform/ holds descriptor and runtime
node scripts/test-level.mjs unit
# passes; adapter-gcp's report holds the AUTH tests
GENOACMS_TEST_GCP=1 GENOACMS_TEST_GCP_IDENTITY=1 GENOACMS_TEST_GCP_PROJECT=genoacms pnpm --filter @genoacms/adapter-gcp exec vitest run test/contract/authentication.test.ts
# step 5 only: 4 tests and the CONF-4 suite pass; no throwaway user remains
pnpm run docs:check
# 0 errors
```

## Critique

**Pros**
- No password material on GCP for GenoaCMS; disabling, resets and breach protection are Google's.
- Works with the author's existing Firebase Authentication, without the Identity Platform upgrade.
- The conformance suite runs against the real service with real users, not only mocks.

**Cons & trade-offs**
- Written before GS1: a wrong assumption about the API ships until GS1 or a contract run finds it.
- `USER_DISABLED` reads as a wrong password, so operators cannot tell a disabled user from a mistyped password in the log until GS1b allows `disabled`.
- Each sign-in and each refresh is a call to Google; an outage stops sign-ins and refreshes (CD2's cost).
- A change in the shape of Google's lookup answer fails every refresh rather than ending sessions: users stay signed in on their current access token, then see errors, until the adapter is fixed.

**Blindspots & missed edge cases**
- Without an API key, which project `signInWithPassword` signs into is the one of the caller's credentials; a `credentials` key from another project would sign users into that project's pool. GS1a must check this.
- `accounts:lookup` with `targetProjectId` needs the runtime identity to be allowed on that project; outside GCP with another project's key, lookups fail and every refresh fails with them.
- Throwaway users are created in production's user pool (GU6, GU10); a run killed between creation and cleanup leaves them, disabled or not, until deleted by hand.
- *Found by GS11:* the tests checked how requests were wired more than what outcomes meant. A `200` body was trusted, so a body cut off by the timeout signed a user in as `undefined`, and a lookup that failed in any way but its status ended the session (GF32). The amended tests assert whole messages and every outcome.
- Whether `AuthenticationAdapters` registers the options under the right specifier is checked only by type-checking a config, which no test does.
- Email addresses are compared by Google, case-insensitively, while the array adapter compares exactly; moving users between them can change who signs in with a differently cased address.
