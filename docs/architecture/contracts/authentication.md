---
type: architecture
title: Authentication contract
codes: [AUTHN]
verified: 7174f7f
---

# Authentication contract

Part of the [service contracts](README.md). Markers, IDs and test references as defined there.

## Design

### Role

The authentication service answers two questions for core: who holds these credentials, and does
this subject still exist and may it sign in. Every authentication adapter implements both, typed in
`@genoacms/contracts/authentication`. This document also specifies what core does with the answers:
it signs users in across the configured providers, and revalidates each session when it refreshes.

Users and their passwords belong to the providers. Core holds the sessions, and the authorization
data decides what a subject may do: a subject that signs in is admitted only if the authorization
data knows it. Provider entries, their order and the loader's rules are configuration
([`configuration.md`](../configuration.md), C3 and loader rule 9).

Each adapter specifies its own mapping onto this contract:
[`adapter-gcp/authentication-identity-platform.md`](../adapter-gcp/authentication-identity-platform.md),
[`adapter-gcp/authentication-firestore.md`](../adapter-gcp/authentication-firestore.md), and every
self-owned store through [`identities.md`](../identities.md). `@genoacms/authentication-adapter-array`
has no document yet.

Not part of the contract: managing users from the CMS (CQ2, `identities.md` IU4), multi-factor
sign-in, and password reset by email (CU1: not every adapter can).

### Decisions

| # | Decision | Where |
| :-- | :-- | :-- |
| CU2 | Credentials are **user** credentials, not administrator credentials: any user of an instance may have them. The array adapter's conventional secret is `GENOACMS_CREDENTIALS`, and the provider key in the templates is `users`. Moved from `configuration.md` U14. | the CLI templates, the config README, core's configs |
| CU3 | 2026-10-02: every adapter implements `getIdentity`, and a rejected sign-in carries its reason. Both are within CU1: every adapter can implement them. | CD2, CD3 |

**CD2. Core revalidates a session with `getIdentity` at each refresh (CF5).** AUTHN-4, AUTHN-6,
AUTHN-7.
*Why:* a user disabled or deleted at the provider is then signed out at the next refresh, within the
access token's lifetime, rather than when the session family expires. Every adapter can look a subject
up: the array adapter in its list, Identity Platform with `accounts:lookup`, a self-owned store by key.
*Cost:* each refresh is a call to the provider. While the provider is unavailable, refreshes fail, so
a user whose access token expires cannot continue until it is back, though the session is kept and
resumes afterwards. A session family has to record the provider that signed it in; families from
before have no record and are revalidated against every provider, where two providers holding the
same subject (`identities.md` ID4) cannot be told apart.

**CD3. A rejection carries its reason; users see one message.** AUTHN-2, AUTHN-5.
*Why:* operators learn from the log why sign-ins fail (a disabled account, a second factor the
contract cannot complete), while users, and anyone guessing, learn nothing that tells an existing
account from a missing one. An adapter that cannot tell the reasons apart reports `credentials`,
so every adapter can implement it.
*Cost:* the return type of `authenticate` changes, which breaks every adapter, third-party ones
included. A reason other than `credentials` is reported only once the password is known to be right,
so it never helps someone guessing passwords; for managed providers that depends on what the
provider checks first (`adapter-gcp/authentication-identity-platform.md` GS1b).

### Findings

| # | Finding | State |
| :-- | :-- | :-- |
| CF1 | **Nothing limits failed sign-ins.** Core calls every authentication provider for every attempt, with no count per email or per client. Behind a managed provider, the provider's own abuse protection sees one client, the server, so it either throttles everyone together or nobody (`adapter-gcp/authentication-identity-platform.md` GS1c). Moved from `configuration.md` F20. | open (CQ1) |
| CF2 | **The array adapter compares plain-text passwords, not in constant time.** Its credentials are a JSON secret with passwords in clear (`authentication-adapter-array/src/runtime.js`). Recorded as a non-goal of the 2026-09 redesign. | open |
| CF3 | **Every password is sent to every provider.** Core calls `authenticate` on all providers at once and takes the first `Identity` in key order (`core/src/lib/script/providers.server.ts`, `callProvidersFunction`). A user of one provider therefore sends their password to every other, and each provider's own lockout counts attempts meant for another. Found 2026-10-02. | open |
| CF4 | **A provider failure reads as a wrong password.** Core keeps only the results of providers that did not throw, and `authenticateAndAuthorize` turns any error into no identity (`core/src/lib/script/auth/auth.server.ts`). An outage of the only provider is reported as `invalid-credentials`, which defeats AUTH-7 and IDS-5. Found 2026-10-02. | open |
| CF5 | **A disabled or deleted user keeps an open session until its family expires.** A refresh does not ask the provider (`core/src/lib/script/auth/session.server.ts`, `refreshSession`). The only immediate revocation is removing the user's role assignments. | open, fixed by CD2 |

### Open questions

| # | Question | Recommendation |
| :-- | :-- | :-- |
| CQ1 | Where are failed sign-ins limited (CF1)? Moved from `configuration.md` Q5. A prerequisite of every self-owned identity store in production (`identities.md` IU5). | In core, before any provider is called, per normalized email and per client address, with the counters in the database service. It then covers every adapter, and a managed provider's per-IP protection stops seeing the server as one abusive client. Needs its own decision: the client address depends on the hosting layer's forwarding header. |
| CQ2 | How are users created and changed from the CMS? Moved from `configuration.md` Q6. | When core has user management screens: an optional capability (CD1) with create, set password, change email, disable and delete, which the array adapter does not offer; plus a CLI command for the first user, who cannot sign in to create themselves. |

### History

*History.* `authenticate(email, password) → Identity | null` was the whole contract from the
monorepo's start through the 2026-09 redesign, which kept it unchanged (`configuration.md` A1 to A6).
`Identity.subject` replaced the email as what authorization binds to, so that a reassigned address
cannot inherit its previous holder's permissions. Until 2026-10-02 the contract was described only in
`configuration.md`, by its signature.

### Verification

No authentication conformance suite exists. **New:** `@genoacms/conformance` gains one, run against
each adapter with a fixture of a valid credential, an unknown email and, where the adapter can hold
one, a disabled identity. It checks AUTHN-2 to AUTHN-4. Core's part (AUTHN-5 to AUTHN-7) is tested at
`e2e`, which needs core's tests in CI first (`docs/README.md`, known gaps).

## Specification

### Types

#### AUTHN-1 · Identity

```ts
interface Identity {
  subject: string
  email: string
}
```

`subject` is the only value that takes part in an authorization decision. `email` is shown to the
user and carried in the session, never used to authorize.

- Test: unverified (a type only)
- Level: unit

### The adapter

#### AUTHN-2 · authenticate

```ts
type RejectionReason = 'credentials' | 'disabled' | 'second-factor-required'

interface Rejection {
  readonly rejected: RejectionReason
}

interface Adapter {
  authenticate (email: string, password: string): Promise<Identity | Rejection>
  getIdentity (subject: string): Promise<Identity | null>
}
```

`authenticate` returns the `Identity` the credentials belong to, or a `Rejection`. `credentials`
covers an unknown email and a wrong password alike, and is the reason whenever the adapter cannot
tell. `disabled` and `second-factor-required` are reported only when the password is known to be
right.

- Test: none yet
- Level: unit, conformance
- State: new (no RFC yet)

#### AUTHN-3 · Failures throw

An adapter that cannot decide, because its service failed, refused to answer or is misconfigured,
throws an `Error` whose message starts with `authentication/`, such as
`authentication/provider-failed: <message>`. It never reports a failure as a `Rejection`, or as `null`
from `getIdentity`.

- Test: none yet
- Level: unit, conformance
- State: new (no RFC yet)

#### AUTHN-4 · getIdentity

`getIdentity(subject)` returns the `Identity` of a subject that exists and could sign in now, with its
current email, and `null` for a subject that is unknown, deleted or disabled.

- Test: none yet
- Level: unit, conformance
- State: new (no RFC yet)

### Core

#### AUTHN-5 · Sign-in

Core calls `authenticate` on every configured provider and uses the `Identity` of the first provider,
in key order, that returned one. A provider that threw counts as no result (CF3, CF4). The `Identity`
is admitted only if the authorization data knows its subject. Any other outcome fails the sign-in with
`invalid-credentials`, the only message the user sees. Core logs each `Rejection` with the provider's
key and its reason, and logs neither the email nor the password.

- Test: none yet
- Level: e2e
- State: new (no RFC yet)

#### AUTHN-6 · A session records its provider

The session family created at sign-in records the key of the provider whose `Identity` was admitted.

- Test: none yet
- Level: e2e
- State: new (no RFC yet)

#### AUTHN-7 · A refresh revalidates the session

Before it rotates a refresh token, core calls `getIdentity` with the family's subject on the provider
the family records, or, for a family that records none, on every provider, taking the first
`Identity` in key order. When the result is `null`, core revokes the family and clears the cookie, and
the user signs in again. When the call throws, the request fails and the family and the cookie are
left unchanged. Otherwise the renewed access token carries the email `getIdentity` returned.

- Test: none yet
- Level: e2e
- State: new (no RFC yet)
