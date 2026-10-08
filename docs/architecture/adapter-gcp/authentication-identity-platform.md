---
type: architecture
title: GCP authentication: Identity Platform
codes: [AUTH]
verified: ce0ab39
---

# GCP authentication: Identity Platform

Part of the [GCP adapter architecture](README.md). Markers, IDs and test references as defined there.

RFC-0032 implemented this document from Google's reference documentation, and GS1 confirms it
afterwards (GU11).

## Design

### Role

`@genoacms/adapter-gcp/authentication/identity-platform` authenticates CMS users against Identity Platform on GCP,
so that GenoaCMS stores no password material there (`configuration.md` U13). It is one of two
authentication adapters on GCP; the other is the Firestore identity store
([`authentication-firestore.md`](authentication-firestore.md), GU9). Authorization stays
core's: a subject that signs in is admitted only if the authorization data knows it.

### Decisions

**GD2. Identity Platform authenticates (GU1, `configuration.md` U13).** AUTH-1 to AUTH-10.
*Why:* on GCP the provider already offers hashing, breach-safe storage, disabling, password reset
and email-enumeration protection. GenoaCMS does not own any of it, and the contract maps directly: `authenticate` onto
`signInWithPassword`, `getIdentity` onto `accounts:lookup`.
*Cost:* users are managed outside the CMS, which is one more console for operators. A user
disabled or deleted in Identity Platform is signed out at the next refresh of their session
(`contracts/authentication.md` CD2), not at once; the immediate revocation is removing the user's role
assignments, which authorization resolves per request. One more
GCP service to enable and pay for above its free tier. Each sign-in is a network call to Google: when
Identity Platform is unavailable nobody can sign in, and a session whose access token expires cannot
refresh until it is back. It serves GCP
only; the other stacks keep the array adapter until a self-owned identity store exists for them
([`identities.md`](../identities.md)). Users moved from here into a self-owned store keep their
subjects but not their passwords, because Identity Platform's password hashes are not in the shared
format (`identities.md` ID1). Further costs, which RFC-0032 accepted:
- every sign-in comes from the function's address, so the provider's abuse protection may refuse correct sign-ins for everybody, or never trip on a slow attack spread over many accounts (GS1c; `contracts/authentication.md` CF1, CQ1);
- an email changed in Identity Platform stays stale in the CMS and its access token until the next sign-in; authorization is unaffected, because `localId` stays;
- a user who enrols a second factor in another client of the project can no longer sign in; the user sees a rejected credential, and the log shows `second-factor-required` (AUTH-4);
- switching reCAPTCHA password protection to enforce mode, for another app of the project, breaks every CMS sign-in at once (AUTH-7);
- without `tenantId`, users of the project's pool from other applications can sign in if their UID has role assignments; authorization bounds the exposure;
- the seed administrator's subject becomes an Identity Platform UID, so switching core's production config without updating `authorization.ts` leaves nobody able to sign in.

**Firebase Authentication or Identity Platform (GU10).** Identity Platform is Firebase Authentication
upgraded: one service, one user pool, one API (`identitytoolkit.googleapis.com`). The adapter calls
the same endpoints either way, so it has no option to choose between them. A project with Firebase
Authentication needs no upgrade; only `tenantId` does, because tenants exist only in Identity
Platform. The upgrade also moves the project to Identity Platform's pricing per monthly active user,
and Google documents no way back.

What the operator sets up, once per project (not automated):
- enable Firebase Authentication, or Identity Platform, with the email/password provider;
- a first user, created in the console. Its UID goes into `authorization.ts` `assignments`, and that is the seed administrator;
- reCAPTCHA password protection off or in audit mode. In enforce mode, a server call without `captchaResponse` is refused;
- per GS1a, either an IAM grant on the runtime identity that permits `signInWithPassword` (README, IAM), or an API key restricted to the Identity Toolkit API and stored with `secret()`, for example `secret('GENOACMS_IDENTITY_API_KEY')`.

### Findings

| # | Finding | State |
| :-- | :-- | :-- |
| GF32 | **A `200` without a usable body is read as a success** (GS11). The runtime reads a body that is not JSON, or that fails mid-read, as `{}`, and builds the identity with `String()`. So `authenticate` returns `{ subject: 'undefined', email: 'undefined' }` for an HTML body, an empty object, or a timeout that fires after the headers, which AUTH-2 says fails as AUTH-7, and the identity breaks AUTHN-1. `getIdentity` returns `null` for the same bodies, so an outage ends the session (AUTHN-3, AUTHN-7). A lookup entry without `localId` returns `{ subject: 'undefined', email }`. AUTH-3 and AUTH-10 do not say what a `200` without `localId` or `email` means. The ADC token fetch is outside AUTH-2's 10-second limit, which covers only the Identity Toolkit call. | fixed, RFC-0032 |
| GF33 | **The AUTH tests miss parts of their statements** (GS11). They pass when: other unknown option keys or a `null` `tenantId` are accepted, or the export or the `AuthenticationAdapters` key is renamed (AUTH-1); the timeout signal is created but not passed, the lookup has no limit, a network error or `5xx` is retried, or `content-type` is dropped (AUTH-2, AUTH-10); the email comes from the request rather than the response (AUTH-3); a second factor is keyed on `mfaInfo` (AUTH-4); the code is split on a space or on `:`, matched by prefix, or `OPERATION_NOT_ALLOWED` or any `INVALID_` code reads as `credentials` (AUTH-5, AUTH-7); the message is `undefined`, has text appended, or lacks the `authentication/` prefix, since `toThrow` matches substrings (AUTH-7); a token is returned as a non-enumerable property, written to `process.stderr` or `console.dir` (AUTH-8); `management` is on the prototype (AUTH-9); a lookup `400`, `404`, network or ADC failure returns `null` (AUTH-10). The contract tests catch three of these. | fixed, RFC-0032 |
| GF34 | **The AUTH tests miss parts of their statements** (GS13). They pass when: a lookup `500` returns `null`, because the test pins `503` (AUTH-10); a `500` or `502` is sent again, because the tests that count requests use `503` and a network error (AUTH-2, AUTH-10); the tenant is dropped from `authenticate` when an API key is set, or from `getIdentity` when none is, because each configuration is tested on one method only (AUTH-2, AUTH-10); the password is trimmed before it is sent (AUTH-2); a `429` is read as throttled (AUTH-6). AUTH-8's "never stored" has no observable test. | open, RFC-0033, except AUTH-8 |

### History

*History.* Until 2026-10-04, core's production config authenticated with
`@genoacms/authentication-adapter-array` and a JSON secret, `GENOACMS_ADMIN_CREDENTIALS`, in Secret
Manager. RFC-0032 added this adapter (`51475a5`), and its contract tests run in CI since `e97641d`.
GS11 found that a `200` without a usable body was read as a success (GF32), and RFC-0032 was
amended to fix it (`f9f652b`) before it was marked implemented.

### Verification

**Established from Google's reference documentation, not by experiment:**
- `signInWithPassword` accepts an API key, **or** the OAuth scopes `identitytoolkit` or `cloud-platform`;
- the response carries `localId`, `email`, `idToken`, `refreshToken`, and `mfaPendingCredential` when a second factor is required;
- with email-enumeration protection, the default for projects created from 2023-09-15, an unknown email and a wrong password both answer `INVALID_LOGIN_CREDENTIALS`.

**GS1, for GD2: partly run, by the contract tests.** Since `e97641d`, CI runs them on every push to
`main` against `genoacms`'s Firebase Authentication, as the CI identity with `roles/firebaseauth.admin`,
and no API key. They established, for GS1a, that such a call signs a user in; for GS1b, that a wrong
password, an unknown email and a disabled user with the correct password are refused with a code
AUTH-5 maps to `credentials`, and that an invalid API key answers `400`; for GS1f, that
`accounts:lookup` answers for an existing, a disabled and an unknown UID. Since 2026-10-04, core's
production signs in through this adapter on plain Firebase Authentication, as the runtime identity
with no API key (GS1a). Not yet established: the
narrowest permission for GS1a and GS1f, a disabled user with a wrong password and a user with MFA
enrolled (GS1b), GS1c, GS1d and GS1e. *History.* Until 2026-10-02 the GD2 RFC was to be written
only after GS1 passed; since GU11, RFC-0032 is written from Google's reference documentation, and a
GS1 result that contradicts a statement reopens it through a new RFC (discovery rule).

| Case | Assumption to verify |
| :-- | :-- |
| GS1a | A call with the runtime identity (ADC, `identitytoolkit` scope) and **no** API key signs a user in, and which IAM permission it needs. Decides whether `apiKey` stays optional. |
| GS1b | The outcomes of AUTH-3 to AUTH-7, for: a wrong password, an unknown email, a disabled user with a wrong and with a correct password, a user with MFA enrolled. Decides AUTH-5's mapping of `USER_DISABLED`. |
| GS1c | Repeated wrong passwords from one server address: after how many does `TOO_MANY_ATTEMPTS_TRY_LATER` appear, and does it then block **other** users' correct sign-ins from the same address? That measures the shared-client risk (`contracts/authentication.md` CF1). |
| GS1d | `localId` format and length, so the account screen's subject field and `authorization.ts` accept it. |
| GS1e | reCAPTCHA password protection in audit mode accepts a server call without `captchaResponse`, and enforce mode refuses it with a distinguishable error. |
| GS1f | `accounts:lookup` by `localId` with the runtime identity (ADC) answers for an existing, a disabled and an unknown UID, and which IAM permission it needs (AUTH-10). |

## Specification

### Descriptor

#### AUTH-1 · Descriptor

Specifier `@genoacms/adapter-gcp/authentication/identity-platform`, kind `authentication`. Runtime specifier `@genoacms/adapter-gcp/authentication/identity-platform/runtime`. Options: `projectId: string` (required, COM-3); `tenantId?: string`, an Identity Platform tenant, omitted for the project's own user pool; `apiKey?: Secret<string>`, decoded as a string; `credentials?: Secret<ServiceAccount>`, decoded as JSON, only for running outside GCP. A present `tenantId` that is not a non-empty string yields `tenantId must be a non-empty string`. Other keys are refused (COM-2). `apiKey` stays optional unless GS1a shows that a call without it fails.

- Test: `packages/adapter-gcp/src/authentication/identity-platform/descriptor.test.ts`
- Level: unit

#### AUTH-9 · No management capability

The runtime offers no `management` (`identities.md` IDM-1). Users are managed in Identity Platform.

- Test: `packages/adapter-gcp/src/authentication/identity-platform/runtime.test.ts`
- Level: unit

### Runtime

#### AUTH-2 · One sign-in call

`authenticate(email, password)` makes one call: `POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword` with the JSON body `{ email, password, returnSecureToken: true }`, plus `tenantId` when configured. With `apiKey`, it is sent as the `key` query parameter. Without it, the call carries an ADC access token with the `https://www.googleapis.com/auth/identitytoolkit` scope. The JSON body is sent with `content-type: application/json`. The Identity Toolkit request is never retried; the ADC token request may be retried inside `google-auth-library`, within the 10 seconds. The call, from obtaining the ADC token to reading the whole response, is abandoned after 10 seconds and fails as AUTH-7.

- Test: `packages/adapter-gcp/src/authentication/identity-platform/runtime.test.ts`, `packages/adapter-gcp/test/contract/authentication.test.ts`
- Level: unit, contract

#### AUTH-3 · Success

A `200` whose body is a JSON object without `mfaPendingCredential`, with `localId` and `email` non-empty strings, returns `{ subject: localId, email }` from the response, not from the request. A `200` whose body is not a JSON object, or lacks either string, is not a sign-in: it fails as AUTH-7 with the message `malformed response`.

- Test: `packages/adapter-gcp/src/authentication/identity-platform/runtime.test.ts`, `packages/adapter-gcp/test/contract/authentication.test.ts`
- Level: unit, contract

#### AUTH-4 · Second factor required

A `200` whose body holds `mfaPendingCredential`, whatever its value, `null` included, returns `{ rejected: 'second-factor-required' }`. The contract has no second step (`contracts/authentication.md` CF30).

- Test: `packages/adapter-gcp/src/authentication/identity-platform/runtime.test.ts`
- Level: unit

#### AUTH-5 · Rejected credentials

A `400` response's **error code** is its `error.message`, up to the first ` : ` when there is one (`TOO_MANY_ATTEMPTS_TRY_LATER : Access to this account …` has the code `TOO_MANY_ATTEMPTS_TRY_LATER`). The codes `INVALID_LOGIN_CREDENTIALS`, `EMAIL_NOT_FOUND`, `INVALID_PASSWORD`, `INVALID_EMAIL`, `MISSING_PASSWORD` and `USER_DISABLED` return `{ rejected: 'credentials' }`. `USER_DISABLED` returns `credentials` rather than `disabled` because it is not known whether Identity Platform reports it only for a correct password (AUTHN-2); GS1b settles that.

- Test: `packages/adapter-gcp/src/authentication/identity-platform/runtime.test.ts`, `packages/adapter-gcp/test/contract/authentication.test.ts`
- Level: unit, contract

#### AUTH-6 · Throttled

`400` with the error code `TOO_MANY_ATTEMPTS_TRY_LATER` throws `authentication/throttled`.

- Test: `packages/adapter-gcp/src/authentication/identity-platform/runtime.test.ts`
- Level: unit

#### AUTH-7 · Provider failure

Any other outcome (network error, timeout, `403`, `5xx`, an invalid key, reCAPTCHA required, an ADC token that cannot be obtained) throws `authentication/provider-failed: <status> <message>`, so an outage is not reported as a wrong password. `<status>` is the HTTP status, or `network` when no response arrived or its body could not be read in full; `<message>` is the response's `error.message`, empty when the response has none, or the error's message. The message ends there. A `400` whose error code (AUTH-5) is neither one of AUTH-5's nor AUTH-6's, `OPERATION_NOT_ALLOWED` for example, is a provider failure.

- Test: `packages/adapter-gcp/src/authentication/identity-platform/runtime.test.ts`, `packages/adapter-gcp/test/contract/authentication.test.ts`
- Level: unit, contract

#### AUTH-8 · Tokens are discarded

The response's `idToken` and `refreshToken` are discarded: never stored, never logged, never returned.

- Test: `packages/adapter-gcp/src/authentication/identity-platform/runtime.test.ts`
- Level: unit

#### AUTH-10 · getIdentity

`getIdentity(subject)` makes one call: `POST https://identitytoolkit.googleapis.com/v1/accounts:lookup` with the JSON body `{ localId: [subject], targetProjectId: projectId }`, plus `tenantId` when configured, carrying an ADC access token with the `https://www.googleapis.com/auth/identitytoolkit` scope. A `200` whose body is a JSON object is read by its first `users` entry. An entry with a non-empty string `localId`, `disabled` not `true` and a string `email` returns `{ subject: localId, email }` from it. An absent `users`, an empty `users`, a disabled entry, or one without an email returns `null`. A `200` whose body is not a JSON object, whose `users` is present but not an array (`null` included), or whose first entry lacks a non-empty string `localId`, disabled or not, fails as AUTH-7 with the message `malformed response`. AUTH-2's content type, its 10-second limit and its "never retried" apply. Any other outcome, a `400`, `404` or `5xx` included, throws as AUTH-7: a failed lookup never returns `null`, so an outage does not end a session (`contracts/authentication.md` AUTHN-3). The permission it needs is decided by GS1f.

- Test: `packages/adapter-gcp/src/authentication/identity-platform/runtime.test.ts`, `packages/adapter-gcp/test/contract/authentication.test.ts`
- Level: unit, contract
