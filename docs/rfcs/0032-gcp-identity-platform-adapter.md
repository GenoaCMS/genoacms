---
type: rfc
number: 32
title: The Identity Platform authentication adapter
status: draft
commits: []
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
- **Requests.** `fetch` with `method: 'POST'`, `content-type: application/json`, the JSON body of AUTH-2 or AUTH-10, and `signal: AbortSignal.timeout(10_000)`. A request with a token carries `authorization: Bearer <token>`. A body that is not JSON reads as `{}`.
- **Responses.** As AUTH-3 to AUTH-7 and AUTH-10. The error code is `error.message` split on ` : `, first part. `USER_DISABLED` is `credentials` (AUTH-5, until GS1b). `<status>` is the HTTP status, or `network` for a rejected `fetch` and for a token `GoogleAuth` cannot provide.
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
8. A falsification audit of AUTH-1 to AUTH-10, recorded as a `GS` entry.

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

**Blindspots & missed edge cases**
- Without an API key, which project `signInWithPassword` signs into is the one of the caller's credentials; a `credentials` key from another project would sign users into that project's pool. GS1a must check this.
- `accounts:lookup` with `targetProjectId` needs the runtime identity to be allowed on that project; outside GCP with another project's key, lookups fail and every refresh fails with them.
- Throwaway users are created in production's user pool (GU6, GU10); a run killed between creation and cleanup leaves them, disabled or not, until deleted by hand.
- Email addresses are compared by Google, case-insensitively, while the array adapter compares exactly; moving users between them can change who signs in with a differently cased address.
