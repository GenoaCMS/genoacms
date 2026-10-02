---
type: architecture
title: Authentication contract
codes: [AUTHN]
verified: fe9d371
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
| CU4 | 2026-10-02: core tries providers one at a time and tells an outage from a wrong password (CF3, CF4). It limits failed sign-ins itself (CQ1): counters in the default bucket, keyed on the pair of email and client address and on the address alone, 5 failures per pair and 50 per address within 15 minutes, as security-policy defaults. | AUTHN-5, CD7 |

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

**CD7. Core limits failed sign-ins per email and address, and per address, before any provider (CF1).**
AUTHN-8 to AUTHN-11.
*Why:* a limit in core covers every adapter, the array adapter and self-owned stores included, which
have no abuse protection of their own (`identities.md` IU5). Keying on the pair of email and address
stops guessing one account from one place without letting a stranger lock its owner out from
elsewhere, which a limit per email alone would. The looser limit per address stops one client
spraying many accounts. A refused attempt reaches no provider, so a managed provider's own
protection stops seeing the server as one abusive client. The counters live beside the session
families in the default bucket, written with generation preconditions, which every storage adapter
offers; the database contract is not specified, and core's database service addresses only the
operator's collections.
*Cost:* a guess spread over many addresses against one account is bounded only by the per-address
limit of each, the provider and the hash cost. Clients behind one address (an office's NAT) share its
50 failures. Where the platform yields no client address, every client shares the key `unknown`. Each
sign-in costs two reads, and a failed one up to two writes. Concurrent attempts are checked before
any is recorded, so a burst can exceed a limit by its own size. The counters are not signed: whoever
can write the bucket can reset them, but can already do far more. A counter object outlives its
window until a successful sign-in deletes it, so they accumulate, one per failed pair; an operator
**SHOULD** set a lifecycle rule deleting objects under `.genoacms/security/sign-in/` after a day.

### Findings

| # | Finding | State |
| :-- | :-- | :-- |
| CF1 | **Nothing limits failed sign-ins.** Core calls every authentication provider for every attempt, with no count per email or per client. Behind a managed provider, the provider's own abuse protection sees one client, the server, so it either throttles everyone together or nobody (`adapter-gcp/authentication-identity-platform.md` GS1c). Moved from `configuration.md` F20. | open, fixed by CD7 |
| CF2 | **The array adapter compares plain-text passwords, not in constant time.** Its credentials are a JSON secret with passwords in clear (`authentication-adapter-array/src/runtime.js`). Recorded as a non-goal of the 2026-09 redesign. | open |
| CF3 | **Every password is sent to every provider.** Core calls `authenticate` on all providers at once and takes the first `Identity` in key order (`core/src/lib/script/providers.server.ts`, `callProvidersFunction`). A user of one provider therefore sends their password to every other, and each provider's own lockout counts attempts meant for another. Found 2026-10-02. AUTHN-5 tries the providers one at a time and stops at the first that knows the user, so a user of a later provider still reaches every earlier one. | mitigated, RFC-0030 |
| CF4 | *History.* **A provider failure reads as a wrong password.** Core keeps only the results of providers that did not throw, and `authenticateAndAuthorize` turns any error into no identity (`core/src/lib/script/auth/auth.server.ts`). An outage of the only provider is reported as `invalid-credentials`, which defeats AUTH-7 and IDS-5. Found 2026-10-02. | fixed, RFC-0030 |
| CF5 | *History.* **A disabled or deleted user keeps an open session until its family expires.** A refresh does not ask the provider (`core/src/lib/script/auth/session.server.ts`, `refreshSession`). The only immediate revocation is removing the user's role assignments. | fixed, RFC-0030 |
| CF10 | **A refresh can skip revalidation and every test still passes.** Core's tests of `renewSession` replace both `refreshSession` and `revalidate`, and `refreshSession`'s tests pass their own callback, so nothing checks how the two are joined. A refresh that never calls `getIdentity`, which brings CF5 back; one that asks every provider in place of the recorded one; one that catches a provider failure, clears the cookie and treats the request as anonymous; and one whose renewed access token carries no email all pass every test. Shown 2026-10-02 by CS1. AUTHN-7. | open, fixed by RFC-0030 |
| CF11 | **The recorded provider is tested only at sign-in, and against the conventional key.** A rotation that drops `provider` from the family passes every test, so after the first refresh the family is revalidated against every provider. `login` passing the fixed key `array` in place of the key `signIn` returned passes too, because the test's provider is named `array` (CU2). Shown 2026-10-02 by CS1. AUTHN-6, AUTHN-7. | open, fixed by RFC-0030 |
| CF12 | **Parts of the sign-in trial that no test checks.** Each of these passes every test. (1) A stopping rejection after an earlier provider threw fails as `sign-in-unavailable`; AUTHN-5's table says `invalid-credentials`. (2) `too-many-attempts` only when every provider that threw was throttled, rather than any. (3) Any message containing `throttled` read as throttled, for example `authentication/provider-failed: 429 throttled`. (4) Rejections other than `credentials` not logged, which are the reasons CD3 logs for operators. (5) Only the last provider's failure logged. (6) The host's `authenticationProviderKeys` sorted, because host test 13's keys, `first` and `second`, are already in sorted order; RFC-0030 described them as `b`, `a`. Shown 2026-10-02 by CS1. AUTHN-5. | open, fixed by RFC-0030 |
| CF13 | **Revalidation of a family without a provider is checked with one answering provider and no failure.** A lookup that skips a provider that throws and goes on to the next passes every test. It ends a session because of an outage when the later providers return `null`, which AUTHN-7 forbids. A lookup that takes the last `Identity` in key order also passes. Shown 2026-10-02 by CS1. AUTHN-7. | open, fixed by RFC-0030 |
| CF14 | **The array adapter's `getIdentity` is tested only with its own subject and an unknown one.** A `getIdentity` that also matches an entry's email, returning that entry for a subject that does not exist, passes every test and the suite, whose unknown subject cannot be an email. Shown 2026-10-02 by CS1. AUTHN-4. | open, fixed by RFC-0030 |

### Open questions

| # | Question | Recommendation |
| :-- | :-- | :-- |
| CQ1 | Where are failed sign-ins limited (CF1)? Moved from `configuration.md` Q5. A prerequisite of every self-owned identity store in production (`identities.md` IU5). | In core, before any provider is called, per normalized email and per client address, with the counters in the database service. It then covers every adapter, and a managed provider's per-IP protection stops seeing the server as one abusive client. Needs its own decision: the client address depends on the hosting layer's forwarding header. *Answered 2026-10-02 by CU4 and CD7: in core, but per pair of email and address and per address, with the counters in the default bucket.* |
| CQ2 | How are users created and changed from the CMS? Moved from `configuration.md` Q6. | When core has user management screens: an optional capability (CD1) with create, set password, change email, disable and delete, which the array adapter does not offer; plus a CLI command for the first user, who cannot sign in to create themselves. |

### History

*History.* `authenticate(email, password) → Identity | null` was the whole contract from the
monorepo's start through the 2026-09 redesign, which kept it unchanged (`configuration.md` A1 to A6).
`Identity.subject` replaced the email as what authorization binds to, so that a reassigned address
cannot inherit its previous holder's permissions. Until 2026-10-02 the contract was described only in
`configuration.md`, by its signature.

### Verification

`@genoacms/conformance`'s authentication suite (CONF-4) runs against the in-memory adapter, the
array adapter and, in contract runs, the Identity Platform adapter, each with a fixture of a valid
credential and, where the adapter can hold one, a disabled identity. It checks AUTHN-2 and AUTHN-4;
AUTHN-3 needs a failing service, so each adapter checks it by fault injection in its own tests, and the
array adapter has none. Core's part (AUTHN-5 to AUTHN-7) is tested at `unit`, with the host and the
storage replaced; no `e2e` test signs in through the login page yet.

**CS1, falsification audit of RFC-0030's statements (WORKFLOW §6.3), AUTHN-2 to AUTHN-7 and CONF-4,
at `5dcc69f`, 2026-10-02.** An agent that wrote neither the code nor the tests, in a separate
session, made 30 mutations of `providers.server.ts`, `session.ts`, `session.server.ts`,
`auth.server.ts`, the array adapter and the host while their unit tests ran; 14 failed a test. The 16
that passed are CF10 to CF14. Against the suite it ran six adapters that violate AUTHN-2 or AUTHN-4;
five passed it (CF15, in [`conformance.md`](conformance.md)). It found no defect in the code, and one
reading AUTHN-5 leaves open: the table's first two rows both hold when one provider throws
`authentication/throttled` and another fails otherwise, and when a throttled message is
`authentication/throttled` with a suffix. The code answers `too-many-attempts` in both cases. AUTHN-3 was not audited, because
no test carries it. The login route and page were not audited, because AUTHN-5 already records them as
unverified (no `e2e` test).

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

- Test: `packages/contracts/test/authentication.test.js`, `packages/authentication-adapter-array/src/runtime.test.js`, `packages/conformance/src/authentication.js`
- Level: unit, conformance

#### AUTHN-3 · Failures throw

An adapter that cannot decide, because its service failed, refused to answer or is misconfigured,
throws an `Error` whose message starts with `authentication/`, such as
`authentication/provider-failed: <message>`. It never reports a failure as a `Rejection`, or as `null`
from `getIdentity`.

- Test: unverified (the array adapter has no service that can fail; `adapter-gcp` AUTH-7 tests the Identity Platform adapter by fault injection)
- Level: unit

#### AUTHN-4 · getIdentity

`getIdentity(subject)` returns the `Identity` of a subject that exists and could sign in now, with its
current email, and `null` for a subject that is unknown, deleted or disabled.

- Test: `packages/authentication-adapter-array/src/runtime.test.js`, `packages/conformance/src/authentication.js`
- Level: unit, conformance

### Core

#### AUTHN-5 · Sign-in

Core calls `authenticate` on the providers one at a time, in key
order. It stops at the first that returns an `Identity`, or a `Rejection` other than `credentials`;
a `credentials` rejection or a thrown failure moves on to the next provider. An `Identity` is admitted
only if the authorization data knows its subject. Otherwise the sign-in fails with one of three
messages, the only ones the user sees:

| Message | When |
| :-- | :-- |
| `too-many-attempts` | no provider returned an `Identity` or stopped the trial with a `Rejection`, and at least one threw an error whose message starts with `authentication/throttled`, whatever the others threw |
| `sign-in-unavailable` | as above, but no provider was throttled, and at least one threw |
| `invalid-credentials` | every other failure: rejections only, or an `Identity` the authorization data does not know |

A `Rejection` that stops the trial fails as `invalid-credentials`, whatever earlier providers threw.
Core logs each `Rejection`, whatever its reason, with the provider's key and the reason, and each failure with the
provider's key and its message. It logs neither the email nor the password.

- Test: `packages/core/src/lib/script/auth/providers.server.test.ts`, `packages/core/src/lib/script/auth/auth.server.test.ts` (unverified: no e2e test yet)
- Level: unit, e2e

#### AUTHN-6 · A session records its provider

The session family created at sign-in records the key of the provider whose `Identity` was admitted.

- Test: `packages/core/src/lib/script/auth/auth.server.test.ts`, `packages/core/src/lib/script/auth/session.server.test.ts`, `packages/core/src/lib/script/auth/session.test.ts` (unverified: no e2e test yet)
- Level: unit, e2e

#### AUTHN-7 · A refresh revalidates the session

Before it rotates a refresh token, core calls `getIdentity` with the family's subject on the provider
the family records, or, for a family that records none, on every provider, taking the first
`Identity` in key order. When the result is `null`, core revokes the family and clears the cookie, and
the user signs in again. When the call throws, the request fails and the family and the cookie are
left unchanged. A family whose provider the config no longer holds revalidates as `null`. Otherwise the renewed access token carries the email `getIdentity` returned.

- Test: `packages/core/src/lib/script/auth/providers.server.test.ts`, `packages/core/src/lib/script/auth/session.server.test.ts` (unverified: no e2e test yet)
- Level: unit, e2e

#### AUTHN-8 · Limits before any provider

Before it calls any provider, core reads the failures recorded for the **pair**, the email normalized
as `identities.md` IDS-1 together with the client address, and for the **address** alone. When the
pair holds at least `signInFailuresPerPair` failures within the last `signInWindowMinutes`, or the
address at least `signInFailuresPerAddress`, the sign-in fails with `too-many-attempts`: no provider
is called and nothing is recorded. When the failures cannot be read, the sign-in fails with
`sign-in-unavailable`.

- Test: none yet
- Level: unit, e2e
- State: new (RFC-0031)

#### AUTHN-9 · Recording failures

A sign-in that fails with `invalid-credentials` records its time as a failure of the pair and of the
address. A successful sign-in removes the pair's failures; the address's stay. A sign-in that fails
with `too-many-attempts` or `sign-in-unavailable` records nothing. A failure to record is logged and
does not change the sign-in's outcome.

- Test: none yet
- Level: unit, e2e
- State: new (RFC-0031)

#### AUTHN-10 · The counter objects

Failures are kept in the default bucket, one object per key:

| Key | Object name |
| :-- | :-- |
| pair | `.genoacms/security/sign-in/pair-<h>.json`, `<h>` the lowercase hexadecimal SHA-256 of the UTF-8 bytes of `<normalized email>\n<address>` |
| address | `.genoacms/security/sign-in/address-<h>.json`, `<h>` the lowercase hexadecimal SHA-256 of the address's UTF-8 bytes |

The address is what the hosting layer reports as the client address, or `unknown` when it reports
none. An object holds `{ "failures": [<milliseconds since the epoch>, …] }`, oldest first, keeping only
failures within the window and at most as many as the key's limit. A write is conditional on the
object's version as read, or on its absence; on a precondition failure the object is read again and
the write retried, at most three times in all. The objects are not signed.

- Test: none yet
- Level: unit, integration
- State: new (RFC-0031)

#### AUTHN-11 · The limits are security policy

The security policy carries `signInFailuresPerPair` (default 5, an integer from 1 to 100),
`signInFailuresPerAddress` (default 50, from 1 to 10,000) and `signInWindowMinutes` (default 15, from
1 to 1,440). The `security` stanza of the config seeds them like the policy's other values. A stored
policy without them is valid, and takes them from the stanza or the defaults; a value outside its
range is refused as the policy's other values are.

- Test: none yet
- Level: unit
- State: new (RFC-0031)
