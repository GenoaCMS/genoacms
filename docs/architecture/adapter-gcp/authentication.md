# GCP authentication: Identity Platform

Part of the [GCP adapter architecture](README.md). Markers and IDs as defined there.

**Everything in this document is New.** No GCP authentication adapter exists. *(current)* core's
production config authenticates with `@genoacms/authentication-adapter-array` and a JSON secret.
GD2 replaces that on GCP once GS1 has passed. No RFC exists yet: it is written after GS1.

## 1. Decision

**GD2. Identity Platform authenticates (GU1, `configuration.md` U13).**
`@genoacms/adapter-gcp/authentication` is an authentication descriptor. Its runtime,
`@genoacms/adapter-gcp/authentication/runtime`, implements `authenticate(email, password)` with one
call to Identity Toolkit:
`POST https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword`, body
`{ email, password, returnSecureToken: true, tenantId? }`.

```ts
interface GcpAuthenticationOptions {
  projectId: string
  /** An Identity Platform tenant. Omitted: the project's own user pool. */
  tenantId?: string
  /**
   * Omitted: the call authenticates as ADC (README GU2) with the `identitytoolkit` scope.
   * Provided: sent as `key`. Which of the two is required is GS1a.
   */
  apiKey?: Secret<string>
  /** Only for running outside GCP, as on every other GCP descriptor. */
  credentials?: Secret<ServiceAccount>
}
```

The response maps to the contract as follows:

| Identity Toolkit answer | `authenticate` returns |
| :-- | :-- |
| `200` without `mfaPendingCredential` | `{ subject: localId, email }`. `localId` is the provider-issued subject the CMS's account screen already asks for. |
| `200` with `mfaPendingCredential` | `null`. The contract has no second step. |
| `400` with `INVALID_LOGIN_CREDENTIALS`, `EMAIL_NOT_FOUND`, `INVALID_PASSWORD`, `USER_DISABLED`, `INVALID_EMAIL` or `MISSING_PASSWORD` | `null`: a rejected credential. |
| `400` with `TOO_MANY_ATTEMPTS_TRY_LATER` | throws `authentication/throttled`. |
| anything else (network, `403`, `5xx`, an invalid key, reCAPTCHA required) | throws `authentication/provider-failed: <status> <message>`. |

Core already turns a throwing provider into a failed sign-in (`authenticateAndAuthorize`). The two
throws exist so that an outage or a misconfiguration is not reported as a wrong password, and so
logs can tell them apart. The ID token and refresh token in the response are discarded, never
stored and never logged. Core issues its own session, as for every provider.

What the operator sets up, once per project (not automated):
- enable Identity Platform, or Firebase Authentication, with the email/password provider;
- a first user, created in the console. Its UID goes into `authorization.ts` `assignments`, and that is the seed administrator;
- reCAPTCHA password protection off or in audit mode. In enforce mode, a server call without `captchaResponse` is refused;
- per GS1a, either an IAM grant on the runtime identity that permits `signInWithPassword` (README §4), or an API key restricted to the Identity Toolkit API and stored with `secret()`, for example `secret('GENOACMS_IDENTITY_API_KEY')`.

*Why:* on GCP the provider already offers hashing, breach-safe storage, disabling, password reset
and email-enumeration protection. GenoaCMS does not own any of it, and the contract needs no change:
`authenticate` maps one to one onto `signInWithPassword`.
*Cost:* users are managed outside the CMS, which is one more console for operators. A user
disabled in Identity Platform cannot sign in again, but a session that is already open continues
until its family expires, because a refresh does not ask the provider. The immediate revocation is
therefore removing the user's role assignments, which authorization resolves per request.

## 2. Verification

**Established from Google's reference documentation, not by experiment:**
- `signInWithPassword` accepts an API key, **or** the OAuth scopes `identitytoolkit` or `cloud-platform`;
- the response carries `localId`, `email`, `idToken`, `refreshToken`, and `mfaPendingCredential` when a second factor is required;
- with email-enumeration protection, the default for projects created from 2023-09-15, an unknown email and a wrong password both answer `INVALID_LOGIN_CREDENTIALS`.

**GS1, for GD2: not run yet.** It needs Identity Platform enabled on a GCP project, so the author runs
it or authorizes it. The GD2 RFC is written only after it passes.

| Case | Assumption to verify |
| :-- | :-- |
| GS1a | A call with the runtime identity (ADC, `identitytoolkit` scope) and **no** API key signs a user in, and which IAM permission it needs. Decides whether `apiKey` stays optional. |
| GS1b | The error codes in GD2's table, for: a wrong password, an unknown email, a disabled user, a user with MFA enrolled. |
| GS1c | Repeated wrong passwords from one server address: after how many does `TOO_MANY_ATTEMPTS_TRY_LATER` appear, and does it then block **other** users' correct sign-ins from the same address? That measures the shared-client risk (`configuration.md` F20). |
| GS1d | `localId` format and length, so the account screen's subject field and `authorization.ts` accept it. |
| GS1e | reCAPTCHA password protection in audit mode accepts a server call without `captchaResponse`, and enforce mode refuses it with a distinguishable error. |

## Critique & architectural sanity check: GU1, GD2

**Pros**
- GenoaCMS stores no password material on GCP. Hashing, storage, disabling, password reset, email-enumeration protection and MFA enrolment are the provider's responsibility, and each is a feature GenoaCMS would otherwise have to build and keep secure.
- The contract does not change. `authenticate` maps one to one onto `signInWithPassword`, and the provider's `localId` is exactly the stable, reassignment-proof subject that `Identity` and the account screen are designed around.
- If GS1a passes, no credential is configured at all, and sign-in authenticates like every other GCP client (GU2).

**Cons & trade-offs**
- Users are managed in a second console. Creating an account is two steps in two places: the user in Identity Platform, then the UID and roles in the CMS.
- One more GCP service to enable and pay for. It is free below a monthly-active-user threshold and priced per user above it.
- Each sign-in is a network call to Google, adding latency and a dependency. When Identity Platform is unavailable, nobody can sign in, although open sessions continue.
- GCP-only. The AWS and self-hosted stacks still have only the array adapter until the deferred identity store exists (`configuration.md` U13).

**Blindspots & missed edge cases**
- **Shared client address (`configuration.md` F20).** Identity Platform's abuse protection sees every sign-in coming from the function. Many wrong passwords against one account could make it refuse correct sign-ins for everybody, and a slow attack spread over many accounts may never trip it. GS1c measures this. `configuration.md` Q5 (throttling in core) is the fix and is not decided yet. Core's own throttling would also have to read the client address correctly (deployment GF7).
- **Revocation latency.** Disabling a user in Identity Platform stops new sign-ins only. An open session lasts until its family expires, because refresh does not consult the provider. Operators must know that removing role assignments is the immediate lever.
- **Email changes.** A user whose email changes in Identity Platform keeps their `localId`, so authorization is unaffected. But the email shown in the CMS, and carried in the access token, stays stale until the next sign-in.
- **MFA enrolment locks the user out.** A user who enrols a second factor in another client of the same project can no longer sign in to the CMS, and the failure reads as a rejected credential (`null`). The log does not say why.
- **reCAPTCHA enforce mode**, switched on later for a web app in the same project, breaks every CMS sign-in at once. GD2 makes it a `provider-failed` error, not a wrong password, but nothing prevents the switch.
- **Tenants.** With `tenantId`, a user of another tenant in the same project is rejected, which is intended. Without it, users of the project-level pool from other applications of the project can sign in to the CMS if their UID has role assignments. Without assignments they are known to nobody and refused (`resolvePrincipal`), so the exposure is bounded by authorization, not by authentication.
- **The seed administrator's subject** changes from a hand-written UUID to an Identity Platform UID. Switching core's production config without updating `authorization.ts` leaves nobody able to sign in.
