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
GD2 replaces that on GCP. RFC-0032 implements it from Google's reference documentation, and GS1
confirms it afterwards (GU11).

## Design

### Role

`@genoacms/adapter-gcp/authentication/identity-platform` will authenticate CMS users against Identity Platform on GCP,
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
format (`identities.md` ID1). Further costs, to settle in the GD2 RFC:
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

None.

### History

None: nothing is implemented yet.

### Verification

**Established from Google's reference documentation, not by experiment:**
- `signInWithPassword` accepts an API key, **or** the OAuth scopes `identitytoolkit` or `cloud-platform`;
- the response carries `localId`, `email`, `idToken`, `refreshToken`, and `mfaPendingCredential` when a second factor is required;
- with email-enumeration protection, the default for projects created from 2023-09-15, an unknown email and a wrong password both answer `INVALID_LOGIN_CREDENTIALS`.

**GS1, for GD2: not run yet.** It needs email/password sign-in enabled in `genoacms` and a credential
the agent may use (GU10). *History.* Until 2026-10-02 the GD2 RFC was to be written only after GS1
passed; since GU11, RFC-0032 is written from Google's reference documentation, and a GS1 result
that contradicts a statement reopens it through a new RFC (discovery rule).

| Case | Assumption to verify |
| :-- | :-- |
| GS1a | A call with the runtime identity (ADC, `identitytoolkit` scope) and **no** API key signs a user in, and which IAM permission it needs. Decides whether `apiKey` stays optional. |
| GS1b | The outcomes of AUTH-3 to AUTH-7, for: a wrong password, an unknown email, a disabled user with a wrong and with a correct password, a user with MFA enrolled. Decides AUTH-5's mapping of `USER_DISABLED`. |
| GS1c | Repeated wrong passwords from one server address: after how many does `TOO_MANY_ATTEMPTS_TRY_LATER` appear, and does it then block **other** users' correct sign-ins from the same address? That measures the shared-client risk (`contracts/authentication.md` CF1). |
| GS1d | `localId` format and length, so the account screen's subject field and `authorization.ts` accept it. |
| GS1e | reCAPTCHA password protection in audit mode accepts a server call without `captchaResponse`, and enforce mode refuses it with a distinguishable error. |
| GS1f | `accounts:lookup` by `localId` with the runtime identity (ADC) answers for an existing, a disabled and an unknown UID, and which IAM permission it needs (AUTH-10). |

## Specification

**New**, all of it: RFC-0032.

### Descriptor

#### AUTH-1 · Descriptor

Specifier `@genoacms/adapter-gcp/authentication/identity-platform`, kind `authentication`. Runtime specifier `@genoacms/adapter-gcp/authentication/identity-platform/runtime`. Options: `projectId: string` (required, COM-3); `tenantId?: string`, an Identity Platform tenant, omitted for the project's own user pool; `apiKey?: Secret<string>`, decoded as a string; `credentials?: Secret<ServiceAccount>`, decoded as JSON, only for running outside GCP. A present `tenantId` that is not a non-empty string yields `tenantId must be a non-empty string`. Other keys are refused (COM-2). `apiKey` stays optional unless GS1a shows that a call without it fails.

- Test: none yet
- Level: unit
- State: new (RFC-0032)

#### AUTH-9 · No management capability

The runtime offers no `management` (`identities.md` IDM-1). Users are managed in Identity Platform.

- Test: none yet
- Level: unit
- State: new (RFC-0032)

### Runtime

#### AUTH-2 · One sign-in call

`authenticate(email, password)` makes one call: `POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword` with the JSON body `{ email, password, returnSecureToken: true }`, plus `tenantId` when configured. With `apiKey`, it is sent as the `key` query parameter. Without it, the call carries an ADC access token with the `https://www.googleapis.com/auth/identitytoolkit` scope. A call that has not answered within 10 seconds is abandoned and fails as AUTH-7.

- Test: none yet
- Level: unit, contract
- State: new (RFC-0032)

#### AUTH-3 · Success

`200` without `mfaPendingCredential` returns `{ subject: localId, email }` from the response.

- Test: none yet
- Level: unit, contract
- State: new (RFC-0032)

#### AUTH-4 · Second factor required

`200` with `mfaPendingCredential` returns `{ rejected: 'second-factor-required' }`. The contract has no second step.

- Test: none yet
- Level: unit, contract
- State: new (RFC-0032)

#### AUTH-5 · Rejected credentials

A `400` response's **error code** is its `error.message`, up to the first ` : ` when there is one (`TOO_MANY_ATTEMPTS_TRY_LATER : Access to this account …` has the code `TOO_MANY_ATTEMPTS_TRY_LATER`). The codes `INVALID_LOGIN_CREDENTIALS`, `EMAIL_NOT_FOUND`, `INVALID_PASSWORD`, `INVALID_EMAIL`, `MISSING_PASSWORD` and `USER_DISABLED` return `{ rejected: 'credentials' }`. `USER_DISABLED` returns `credentials` rather than `disabled` because it is not known whether Identity Platform reports it only for a correct password (AUTHN-2); GS1b settles that.

- Test: none yet
- Level: unit, contract
- State: new (RFC-0032)

#### AUTH-6 · Throttled

`400` with the error code `TOO_MANY_ATTEMPTS_TRY_LATER` throws `authentication/throttled`.

- Test: none yet
- Level: unit, contract
- State: new (RFC-0032)

#### AUTH-7 · Provider failure

Any other outcome (network error, timeout, `403`, `5xx`, an invalid key, reCAPTCHA required, an ADC token that cannot be obtained) throws `authentication/provider-failed: <status> <message>`, so an outage is not reported as a wrong password. `<status>` is the HTTP status, or `network` when no response arrived; `<message>` is the response's `error.message`, or the error's message.

- Test: none yet
- Level: unit, contract
- State: new (RFC-0032)

#### AUTH-8 · Tokens are discarded

The response's `idToken` and `refreshToken` are discarded: never stored, never logged, never returned.

- Test: none yet
- Level: unit
- State: new (RFC-0032)

#### AUTH-10 · getIdentity

`getIdentity(subject)` makes one call: `POST https://identitytoolkit.googleapis.com/v1/accounts:lookup` with the JSON body `{ localId: [subject], targetProjectId: projectId }`, plus `tenantId` when configured, carrying an ADC access token with the `https://www.googleapis.com/auth/identitytoolkit` scope. A response whose `users` holds an entry with `disabled` not `true` and an `email` returns `{ subject: localId, email }` from it; no entry, a disabled one, or one without an email returns `null`. The 10-second limit of AUTH-2 applies. Any other outcome throws as AUTH-7. The permission it needs is decided by GS1f.

- Test: none yet
- Level: unit, contract
- State: new (RFC-0032)
