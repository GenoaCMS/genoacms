---
type: architecture
title: GCP authentication: Identity Platform
codes: [AUTH]
verified: b050b3b
---

# GCP authentication: Identity Platform

Part of the [GCP adapter architecture](README.md). Markers, IDs and test references as defined there.

**Everything in this document is New.** No GCP authentication adapter exists. *(current)* core's
production config authenticates with `@genoacms/authentication-adapter-array` and a JSON secret.
GD2 replaces that on GCP once GS1 has passed. No RFC exists yet: it is written after GS1.

## Design

### Role

`@genoacms/adapter-gcp/authentication` will authenticate CMS users against Identity Platform on GCP,
so that GenoaCMS stores no password material there (`configuration.md` U13). Authorization stays
core's: a subject that signs in is admitted only if the authorization data knows it.

### Decisions

**GD2. Identity Platform authenticates (GU1, `configuration.md` U13).** AUTH-1 to AUTH-8.
*Why:* on GCP the provider already offers hashing, breach-safe storage, disabling, password reset
and email-enumeration protection. GenoaCMS does not own any of it, and the contract needs no change:
`authenticate` maps one to one onto `signInWithPassword`.
*Cost:* users are managed outside the CMS, which is one more console for operators. A user
disabled in Identity Platform cannot sign in again, but a session that is already open continues
until its family expires, because a refresh does not ask the provider. The immediate revocation is
therefore removing the user's role assignments, which authorization resolves per request. One more
GCP service to enable and pay for above its free tier. Each sign-in is a network call to Google: when
Identity Platform is unavailable nobody can sign in, although open sessions continue. It serves GCP
only; the other stacks keep the array adapter until the identity store exists (`configuration.md`
U13). Further costs, to settle in the GD2 RFC:
- every sign-in comes from the function's address, so the provider's abuse protection may refuse correct sign-ins for everybody, or never trip on a slow attack spread over many accounts (GS1c; `configuration.md` F20, Q5);
- an email changed in Identity Platform stays stale in the CMS and its access token until the next sign-in; authorization is unaffected, because `localId` stays;
- a user who enrols a second factor in another client of the project can no longer sign in, and the failure reads as a rejected credential (AUTH-4);
- switching reCAPTCHA password protection to enforce mode, for another app of the project, breaks every CMS sign-in at once (AUTH-7);
- without `tenantId`, users of the project's pool from other applications can sign in if their UID has role assignments; authorization bounds the exposure;
- the seed administrator's subject becomes an Identity Platform UID, so switching core's production config without updating `authorization.ts` leaves nobody able to sign in.

What the operator sets up, once per project (not automated):
- enable Identity Platform, or Firebase Authentication, with the email/password provider;
- a first user, created in the console. Its UID goes into `authorization.ts` `assignments`, and that is the seed administrator;
- reCAPTCHA password protection off or in audit mode. In enforce mode, a server call without `captchaResponse` is refused;
- per GS1a, either an IAM grant on the runtime identity that permits `signInWithPassword` (README, IAM), or an API key restricted to the Identity Toolkit API and stored with `secret()`, for example `secret('GENOACMS_IDENTITY_API_KEY')`.

### Findings

None.

### History

None: nothing is implemented yet.

### Verification

**Established from Google's reference documentation, not by experiment:**
- `signInWithPassword` accepts an API key, **or** the OAuth scopes `identitytoolkit` or `cloud-platform`;
- the response carries `localId`, `email`, `idToken`, `refreshToken`, and `mfaPendingCredential` when a second factor is required;
- with email-enumeration protection, the default for projects created from 2023-09-15, an unknown email and a wrong password both answer `INVALID_LOGIN_CREDENTIALS`.

**GS1, for GD2: not run yet.** It needs Identity Platform enabled on a GCP project, so the author runs
it or authorizes it. The GD2 RFC is written only after it passes.

| Case | Assumption to verify |
| :-- | :-- |
| GS1a | A call with the runtime identity (ADC, `identitytoolkit` scope) and **no** API key signs a user in, and which IAM permission it needs. Decides whether `apiKey` stays optional. |
| GS1b | The outcomes of AUTH-3 to AUTH-7, for: a wrong password, an unknown email, a disabled user, a user with MFA enrolled. |
| GS1c | Repeated wrong passwords from one server address: after how many does `TOO_MANY_ATTEMPTS_TRY_LATER` appear, and does it then block **other** users' correct sign-ins from the same address? That measures the shared-client risk (`configuration.md` F20). |
| GS1d | `localId` format and length, so the account screen's subject field and `authorization.ts` accept it. |
| GS1e | reCAPTCHA password protection in audit mode accepts a server call without `captchaResponse`, and enforce mode refuses it with a distinguishable error. |

## Specification

**New**, all of it: no RFC yet, written after GS1.

### Descriptor

#### AUTH-1 · Descriptor

Specifier `@genoacms/adapter-gcp/authentication`, kind `authentication`. Runtime specifier `@genoacms/adapter-gcp/authentication/runtime`. Options: `projectId: string` (required, COM-3); `tenantId?: string`, an Identity Platform tenant, omitted for the project's own user pool; `apiKey?: Secret<string>`, decoded as a string; `credentials?: Secret<ServiceAccount>`, decoded as JSON, only for running outside GCP. Other keys are refused (COM-2). Whether `apiKey` stays optional is decided by GS1a.

- Test: none yet
- Level: unit
- State: new (no RFC yet)

### Runtime

#### AUTH-2 · One sign-in call

`authenticate(email, password)` makes one call: `POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword` with the JSON body `{ email, password, returnSecureToken: true }`, plus `tenantId` when configured. With `apiKey`, it is sent as the `key` query parameter. Without it, the call carries an ADC access token with the `https://www.googleapis.com/auth/identitytoolkit` scope.

- Test: none yet
- Level: unit, contract
- State: new (no RFC yet)

#### AUTH-3 · Success

`200` without `mfaPendingCredential` returns `{ subject: localId, email }` from the response.

- Test: none yet
- Level: unit, contract
- State: new (no RFC yet)

#### AUTH-4 · Second factor required

`200` with `mfaPendingCredential` returns `null`. The contract has no second step.

- Test: none yet
- Level: unit, contract
- State: new (no RFC yet)

#### AUTH-5 · Rejected credentials

`400` whose error message is `INVALID_LOGIN_CREDENTIALS`, `EMAIL_NOT_FOUND`, `INVALID_PASSWORD`, `USER_DISABLED`, `INVALID_EMAIL` or `MISSING_PASSWORD` returns `null`: a rejected credential.

- Test: none yet
- Level: unit, contract
- State: new (no RFC yet)

#### AUTH-6 · Throttled

`400` with `TOO_MANY_ATTEMPTS_TRY_LATER` throws `authentication/throttled`.

- Test: none yet
- Level: unit, contract
- State: new (no RFC yet)

#### AUTH-7 · Provider failure

Any other outcome (network error, `403`, `5xx`, an invalid key, reCAPTCHA required) throws `authentication/provider-failed: <status> <message>`, so an outage is not reported as a wrong password.

- Test: none yet
- Level: unit, contract
- State: new (no RFC yet)

#### AUTH-8 · Tokens are discarded

The response's `idToken` and `refreshToken` are discarded: never stored, never logged, never returned.

- Test: none yet
- Level: unit
- State: new (no RFC yet)
