---
type: rfc
number: 30
title: The authentication contract, sign-in across providers, and session revalidation
status: draft
commits: [fe9d371, 4bce5b2]
depends: []
architecture: [architecture/contracts/authentication.md, architecture/contracts/conformance.md, architecture/contracts/README.md, architecture/host.md]
changes: [AUTHN-2 breaking, AUTHN-4 breaking, AUTHN-3 added, AUTHN-5 added, AUTHN-6 added, AUTHN-7 added, CONF-4 added]
commit-subject: "feat: authentication rejections carry a reason, getIdentity revalidates sessions, providers are tried in order (AUTHN-2 to AUTHN-7, CONF-4)"
---

# RFC-0030: The authentication contract, sign-in across providers, and session revalidation

## Summary

The authentication contract has one method, `authenticate(email, password) → Identity | null`, and
core uses it badly: it calls every provider at once (CF3), reads a provider outage as a wrong
password (CF4), and never asks a provider again once a session exists, so a disabled user keeps
working until the session family expires (CF5). Operators cannot see why a sign-in failed.

This RFC:

1. changes `authenticate` to return `Identity | Rejection`, a rejection carrying its reason (AUTHN-2,
   CD3), and adds `getIdentity(subject)` (AUTHN-4), both implemented by every adapter (CU1, CU3);
2. makes core try providers one at a time, in key order, tell an outage from a wrong password, and
   show the user one of three messages (AUTHN-5, CU4);
3. records in each session family the provider that signed it in (AUTHN-6), and revalidates the
   subject with that provider before each refresh token rotation (AUTHN-7, CD2);
4. adds `authenticationProviderKeys` to the host, so core can construct providers one at a time;
5. ports `@genoacms/authentication-adapter-array` to the new contract;
6. adds the authentication conformance suite (CONF-4) and runs it against the array adapter.

**Amended 2026-10-02, after its falsification audit (CS1).** The branch was not merged, so the
RFC went back to `draft`. The amendment changes no behavior. It settles one reading of AUTHN-5,
where a throttled provider among other failures gives `too-many-attempts`. It also adds the tests
that CS1 showed missing (CF10 to CF15): how a refresh is joined to revalidation, the recorded
provider after a rotation, the trial's mixed failures and logs, the lookup in order, and the
suite's email and disabled checks. The amendment is marked *Amendment* below.

**Amended again 2026-10-02, after the audit of the amendment (CS2).** The amendment marked *Second
amendment* below changes three behaviors:
- with no provider configured, sign-in fails as `sign-in-unavailable` and logs why;
- revalidating a family that records no provider moves on past a provider that throws, as sign-in
  does, and fails only when no provider returned an `Identity`;
- when an identity is gone and its family cannot be removed, the refresh fails (CF21).

It also adds the tests CS2 showed missing (CF16 to CF20).

The limits on failed sign-ins (AUTHN-8 to AUTHN-11) are RFC-0031. AUTHN-5's text here omits them;
RFC-0031 adds them.

## Files

**Modify or create only:**

| File | Change |
| :-- | :-- |
| `packages/contracts/src/authentication/types.d.ts` | add `RejectionReason`, `Rejection` |
| `packages/contracts/src/authentication/adapter.d.ts` | `authenticate` returns `Identity \| Rejection`; add `getIdentity` |
| `packages/contracts/src/authentication/index.d.ts` | export the new types |
| `packages/contracts/src/authentication/index.js` | add `isRejection` (the subpath's first runtime value) |
| `packages/contracts/test/authentication.test.js` | create: `isRejection` (the package's runtime tests live in `test/`) |
| `packages/contracts/test/types/contracts.test.ts` | the authentication type test takes the new shape, and two `@ts-expect-error` cases |
| `packages/authentication-adapter-array/src/runtime.js` | return `{ rejected: 'credentials' }`; add `getIdentity` |
| `packages/authentication-adapter-array/src/runtime.d.ts` | match |
| `packages/authentication-adapter-array/src/runtime.test.js` | update and add tests (§Tests) |
| `packages/authentication-adapter-array/test/conformance.test.js` | create: run CONF-4 |
| `packages/authentication-adapter-array/package.json`, `pnpm-lock.yaml` | devDependency `@genoacms/conformance` |
| `packages/conformance/src/authentication.js` | create: `runAuthenticationConformance` |
| `packages/conformance/src/index.js`, `src/index.d.ts` | export it |
| `packages/conformance/test/authentication.test.js` | create: the suite against an in-memory adapter |
| `packages/conformance/test/memory.js` | add `memoryAuthentication` |
| `packages/conformance/test/mutants/authentication.js`, `authentication.mutant.js`, `vitest.config.js` | create: the mutants, the file a child Vitest runs against one of them, and its config |
| `packages/conformance/package.json` | `description` names authentication too |
| `packages/config/src/host/index.ts` | add `authenticationProviderKeys`; remove `authenticationProviders` |
| `packages/config/src/host/*.test.ts` | the host test that covered `authenticationProviders` covers the keys instead |
| `packages/core/src/lib/script/auth/providers.server.ts` | rewrite: `signIn` and `revalidate` (§Specification) |
| `packages/core/src/lib/script/providers.server.ts` | delete: its only caller was the old `authenticate` |
| `packages/core/src/lib/script/auth/auth.server.ts` | `login` throws `SignInError`; `renewSession` revalidates |
| `packages/core/src/lib/script/auth/session.ts` | `SessionFamily.provider`; `newFamily` and `rotated` take it and the email |
| `packages/core/src/lib/script/auth/session.server.ts` | `startSession(identity, provider)`; `refreshSession(familyId, token, revalidate)` |
| `packages/core/src/routes/login/+page.server.ts` | `fail(400, { reason: error.code })` |
| `packages/core/src/routes/login/+page.svelte` | one message per reason |
| `packages/core/src/lib/script/auth/auth.server.test.ts`, `providers.server.test.ts` (create), `session.server.test.ts`, `session.test.ts` | §Tests |
| `scripts/test-level.mjs` | the `conformance` level runs `packages/authentication-adapter-array` `test/conformance.test.js` |
| `docs/architecture/contracts/authentication.md`, `conformance.md`, `README.md`, `docs/architecture/host.md` | statements current, test files named (step 6) |

## Specification

### The contract (AUTHN-2 to AUTHN-4)

AUTHN-2, AUTHN-3 and AUTHN-4 stand as written in `contracts/authentication.md`. In TypeScript, in
`@genoacms/contracts/authentication`:

```ts
type RejectionReason = 'credentials' | 'disabled' | 'second-factor-required'
interface Rejection { readonly rejected: RejectionReason }

interface Adapter {
  authenticate (email: string, password: string): Promise<Identity | Rejection>
  getIdentity (subject: string): Promise<Identity | null>
}

/** True for a Rejection, false for an Identity. */
declare function isRejection (result: Identity | Rejection): result is Rejection
```

`isRejection(result)` is `typeof result === 'object' && result !== null && 'rejected' in result`.

### The array adapter

- `authenticate`: the entry whose `email` equals the given email and whose `password` equals the
  given password returns `{ subject, email }`; any other input returns `{ rejected: 'credentials' }`.
  Comparison stays plain and exact (CF2 is not addressed).
- `getIdentity(subject)`: the entry with that `subject` returns `{ subject, email }`; none returns
  `null`. The adapter has no disabled entries.

### The host

`Host` loses `authenticationProviders` and gains:

```ts
/** Authentication provider keys, in config key order. Constructs nothing. */
readonly authenticationProviderKeys: readonly string[]
```

`host.md`'s `Host` interface and its construction notes change accordingly. `host.authentication(key)`
is unchanged and constructs on first use.

### Core: sign-in (AUTHN-5, without the limits)

AUTHN-5's text, as this RFC implements it, is the text in `contracts/authentication.md` without the
opening "After the limits allow it (AUTHN-8)," and without "; or the limits refused the attempt
(AUTHN-8)". RFC-0031 restores both.

```ts
// core/src/lib/script/auth/providers.server.ts
type SignInFailure = 'invalid-credentials' | 'too-many-attempts' | 'sign-in-unavailable'
type SignInResult =
  | { outcome: 'signed-in', provider: string, identity: Identity }
  | { outcome: 'failed', failure: SignInFailure }

declare function signIn (email: string, password: string): Promise<SignInResult>
declare function revalidate (subject: string, provider: string | undefined): Promise<Identity | null>
```

`signIn` constructs and calls the providers of `host.authenticationProviderKeys` one at a time. A
provider whose construction rejects counts as a provider that threw. It returns `signed-in` for the
first `Identity`; it does not consult authorization, which `login` does. Its failure follows
AUTHN-5's table. It logs:

- a rejection: `console.warn('[genoacms:auth] provider <key> rejected the sign-in: <reason>')`;
- a failure: `console.error('[genoacms:auth] provider <key> failed: <message>')`.

*Amendment.* AUTHN-5's table now gives `too-many-attempts` when any provider threw an error whose
message starts with `authentication/throttled`, whatever the others threw, and a `Rejection` that
stops the trial gives `invalid-credentials` whatever earlier providers threw. Both are what the code
already does. Every rejection is logged, whatever its reason, and every failure.

`login(email, password, cookies)` throws `SignInError` (exported from `auth.server.ts`, `name`
`'SignInError'`, `code: SignInFailure`, `message` equal to `code`) for a failed sign-in and for an
`Identity` whose subject authorization does not know (`invalid-credentials`). Errors of session
storage propagate unchanged, as today. The login route returns `fail(400, { reason: error.code })`
for a `SignInError` and rethrows anything else. The login page shows:

| `reason` | Toast |
| :-- | :-- |
| `invalid-credentials` | `Wrong email or password` |
| `too-many-attempts` | `Too many attempts. Try again later` |
| `sign-in-unavailable` | `Sign-in is unavailable right now. Try again later` |
| anything else, or no action result | `Login failed` |

### Core: sessions (AUTHN-6, AUTHN-7)

- `SessionFamily` gains `provider?: string`. `parseSessionFamily` accepts it absent, or a non-empty
  string, and refuses anything else. A family written before this RFC has none.
- `newFamily(familyId, subject, email, provider, token, now, lifetimeDays)` records `provider`.
  `startSession(identity, provider)` replaces `startSession(subject, email)`.
- `rotated(family, nextToken, now, email)` also replaces the family's `email`.
- `refreshSession(familyId, token, revalidate)` takes
  `revalidate: (family: SessionFamily) => Promise<Identity | null>`. For a `current` token, and only
  then, it calls `revalidate` before writing the rotated family:
  - `null`: it revokes the family and returns `{ outcome: 'rejected', reason: 'identity-gone' }`;
  - a thrown error: it propagates; the family is not written and not revoked;
  - an `Identity`: the rotated family carries its `email`, and so does the `refreshed` result.
  The `concurrent` and every rejecting path are unchanged and call no provider.
- `revalidate(subject, provider)`: with a provider key that `host.authenticationProviderKeys` no longer
  holds, `null`, so the session ends; with a configured key, `getIdentity` on that provider; without one,
  `getIdentity` on each provider in key order, returning the first `Identity`, or `null` when every
  one returned `null`. A provider that throws makes `revalidate` throw `Error('session/revalidation-failed: <key>: <message>')`.
- `renewSession` passes `family => revalidate(family.subject, family.provider)`. A thrown error
  propagates out of `authenticateRequest`, so the request fails with SvelteKit's 500 and the cookie
  is left as it was.

*Second amendment.*
- `signIn` with an empty `host.authenticationProviderKeys` logs
  `console.error('[genoacms:auth] no authentication provider is configured')` and returns
  `{ outcome: 'failed', failure: 'sign-in-unavailable' }`.
- `revalidate(subject, undefined)` calls `getIdentity` on each provider in key order and returns the
  first `Identity`; it calls no provider after that one. A provider that throws, or fails to
  construct, moves on to the next. When no provider returned an `Identity` and at least one threw,
  it throws `Error('session/revalidation-failed: <key>: <message>')` for the first that threw; when
  every one returned `null`, it returns `null`. With a recorded provider, nothing changes.
- `refreshSession`, on `identity-gone`, removes the family with `deleteInternalObject` directly and
  lets its error propagate: the result is then a thrown error, the family stays, and so does the
  cookie. The family was just read, so a failed delete is a failure, not an absence. `revokeSession`,
  used by sign-out and on reuse, still swallows errors.

### The conformance suite (CONF-4)

`runAuthenticationConformance(adapter, fixture)` as CONF-4 states, registered as
`suite('authentication conformance', …)`. Its tests and their titles are in §Tests. The
`credentials` checks use the fixture's email with the password `fixture.identity.password + '-wrong'`,
and the email `conformance-unknown-<random UUID>@example.invalid`.

*Amendment.* The identity checks compare the whole `Identity`, `{ subject, email }` of the fixture,
for `authenticate` and for `getIdentity`. The wrong-password check tries three passwords:
`password + '-wrong'`, `''` and `password.slice(0, -1)`. With `disabled`, a new check sends its email
with `disabled.password + '-wrong'` and expects `{ rejected: 'credentials' }`.

*Second amendment.* The wrong passwords are `password + '-wrong'`, `''`, `password.slice(0, -1)`,
the password with its first character's code point changed by one (`^ 1`), the password with the case
of each letter swapped, and `` ` ${password} ` ``. Any that equals the right password is left out. The
disabled identity gets the same set. The identity check presents the fixture's credentials twice,
and the `getIdentity` checks, for the fixture and for the disabled identity, ask twice. The unknown-subject check also asks for the fixture's email,
its subject without its last character, and its subject with the case of its letters swapped, when
that differs from the subject. The empty subject is not tried: an adapter MAY treat it as a malformed
request.

## Non-goals

- Limiting failed sign-ins (AUTHN-8 to AUTHN-11): RFC-0031.
- The Identity Platform adapter: its RFC follows GS1. The Firestore store: deferred (`identities.md` IU6).
- CF2, the array adapter's plain-text comparison.
- CONF-6, mutants for every suite; this RFC's suite gets its own mutant tests only (§Tests).
- Revalidating on the `concurrent` refresh path, or on requests whose access token is still valid.
- Changing how core reads `getClientAddress`; nothing here needs it.

## Tests

All new tests are written first, from this RFC, marked `it.fails` where the code does not yet
satisfy them (step 2).

**Contracts**, `packages/contracts/src/authentication/index.test.js` (unit):
- `AUTHN-2: isRejection tells a rejection from an identity`: *given* `{ rejected: 'credentials' }` and `{ subject: 's', email: 'e' }`, *then* `true` and `false`.

**Array adapter**, `packages/authentication-adapter-array/src/runtime.test.js` (unit):
- `AUTHN-2: authenticates a matching email and password to its subject` (renamed from the existing test, assertion unchanged).
- `keeps two providers independent`: unchanged, except that the other provider's user is now rejected `{ rejected: 'credentials' }` instead of `null`.
- `AUTHN-2: rejects a wrong password and an unknown email for credentials`: *given* one entry, *when* the password is wrong, and *when* the email is unknown, *then* both return `{ rejected: 'credentials' }`, not `null`.
- `AUTHN-4: looks a subject up`: *given* an entry with subject `s1`, *then* `getIdentity('s1')` returns its `{ subject, email }` and `getIdentity('nobody')` returns `null`.

**Array adapter**, `packages/authentication-adapter-array/test/conformance.test.js` (conformance): calls `runAuthenticationConformance` with one entry and no `disabled`.

**Conformance suite**, `packages/conformance/test/authentication.test.js` (conformance), against `memoryAuthentication()` with a valid and a disabled identity, the suite's tests:
- `AUTHN-2: the fixture's credentials return its identity`;
- `AUTHN-2: a wrong password is rejected for credentials`;
- `AUTHN-2: an unknown email is rejected for credentials`;
- `AUTHN-2: a disabled identity's correct password is rejected` (accepts `disabled` or `credentials`);
- `AUTHN-4: getIdentity returns the fixture's identity`;
- `AUTHN-4: getIdentity returns null for an unknown subject`;
- `AUTHN-4: getIdentity returns null for a disabled subject`.

And in the same file, `CONF-4: each assertion fails against its mutant`: *given* one mutant of `memoryAuthentication` per suite test above (returns the identity for any password; returns `null` instead of a rejection; returns the identity of a disabled entry; `getIdentity` returns `null` for the valid subject; returns an identity for an unknown subject; returns the disabled identity), *when* the suite runs against each in a child Vitest run, *then* exactly the corresponding test fails.

**Host**, the existing host test of `authenticationProviders` (unit), renamed `lists the authentication provider keys in config key order, constructing nothing`: *given* a manifest with providers `b`, `a`, *then* `authenticationProviderKeys` is `['b', 'a']` and no runtime was loaded.

**Core**, `packages/core/src/lib/script/auth/providers.server.test.ts` (unit), the host mocked with in-memory providers:
- `AUTHN-5: stops at the first provider that returns an identity`: *given* providers `a` (identity) and `b`, *then* `b`'s `authenticate` is never called and the result names `a`.
- `AUTHN-5: a credentials rejection moves on to the next provider`: *given* `a` rejecting `credentials` and `b` returning an identity, *then* the result names `b`.
- `AUTHN-5: a rejection other than credentials stops the trial`: *given* `a` rejecting `disabled` and `b` returning an identity, *then* `b` is never called and the failure is `invalid-credentials`.
- `AUTHN-5: a provider that throws does not stop the trial`: *given* `a` throwing and `b` returning an identity, *then* signed in with `b`.
- `AUTHN-5: an outage reads as unavailable, not as wrong credentials`: *given* `a` throwing and `b` rejecting `credentials`, *then* `sign-in-unavailable`.
- `AUTHN-5: a throttled provider reads as too many attempts`: *given* `a` throwing `authentication/throttled` and no other, *then* `too-many-attempts`.
- `AUTHN-5: a provider that fails to construct counts as one that threw`: *given* `host.authentication('a')` rejecting and `b` rejecting `credentials`, *then* `sign-in-unavailable`.
- `AUTHN-5: logs rejections and failures without the email or password`: *given* one rejecting and one throwing provider, *then* one warning and one error name each provider's key and reason or message, and no logged line contains the email or the password.
- `AUTHN-7: revalidates with the recorded provider only`: *given* providers `a` and `b` and provider `b`, *then* only `b.getIdentity` is called.
- `AUTHN-7: a provider no longer configured ends the session`: *given* the recorded provider `c`, which the config does not hold, *then* `revalidate` returns `null` and constructs no provider.
- `AUTHN-7: revalidates a family without a provider against every provider in order`: *given* `a` returning `null` and `b` an identity, *then* `b`'s identity; and with both `null`, `null`.
- `AUTHN-7: a provider failure fails the revalidation`: *given* the recorded provider throwing, *then* `revalidate` rejects with a message starting `session/revalidation-failed: b:`.

**Core**, `packages/core/src/lib/script/auth/auth.server.test.ts` (unit), `./providers.server` mocked:
- `AUTHN-5: a sign-in authorization does not know fails as invalid credentials` (the existing unknown-principal test, renamed, now asserting `SignInError` with `code` `invalid-credentials`).
- `AUTHN-5: each failure reaches the caller as its code`: *given* `signIn` failing with each of the three failures, *then* `login` throws `SignInError` with that `code`, and writes no cookie.
- `AUTHN-6: a session records the provider that signed it in`: *given* `signIn` signing in with provider `b`, *then* `startSession` receives `b`.

**Core**, `packages/core/src/lib/script/auth/session.server.test.ts` (unit), in-memory storage as today:
- `AUTHN-6: records the provider in the family`: *given* `startSession(identity, 'b')`, *then* the stored, signed family has `provider: 'b'`.
- `AUTHN-6: reads a family written without a provider`: *given* a family stored without `provider`, *then* a refresh succeeds and `revalidate` receives `provider` `undefined`.
- `AUTHN-7: a gone identity ends the session`: *given* `revalidate` returning `null`, *then* the result is `rejected` with `identity-gone`, the family is deleted, and a later refresh is `rejected`.
- `AUTHN-7: an unavailable provider keeps the session as it was`: *given* `revalidate` throwing, *then* `refreshSession` rejects, the stored family is byte-for-byte unchanged, and the same token refreshes once `revalidate` succeeds.
- `AUTHN-7: the renewed session carries the current email`: *given* `revalidate` returning a new email, *then* the `refreshed` result and the stored family carry it.
- `AUTHN-7: a concurrent presentation calls no provider`: *given* the superseded token inside the grace window, *then* `revalidate` is not called.

**Core**, `packages/core/src/lib/script/auth/session.test.ts` (unit):
- `AUTHN-6: refuses a provider that is not a non-empty string`: *given* payloads with `provider` `''`, `1` and `null`, *then* `parseSessionFamily` returns `undefined`; absent, it parses.

**Amendment (CS1).** Written from CF10 to CF15. Where an existing test changes, its title stays.

`packages/core/src/lib/script/auth/providers.server.test.ts` (unit):
- `AUTHN-5: a stopping rejection after an outage fails as invalid credentials`: *given* `a` throwing `authentication/provider-failed: 503 down` and `b` rejecting `disabled`, *then* `invalid-credentials`.
- `AUTHN-5: a throttled provider reads as too many attempts whatever the others threw`: *given* `a` throwing `authentication/provider-failed: 503 down` and `b` throwing `authentication/throttled`, *then* `too-many-attempts`; *and given* the same providers in the other order, *then* `too-many-attempts`.
- `AUTHN-5: only a message starting authentication/throttled is throttled`: *given* one provider throwing `authentication/provider-failed: 429 throttled`, *then* `sign-in-unavailable`; *given* one throwing `authentication/throttled: retry after 30s`, *then* `too-many-attempts`.
- `AUTHN-5: logs every rejection and every failure`: *given* `a` rejecting `credentials`, `b` and `c` throwing, and `d` rejecting `disabled`, *then* warnings name `a` with `credentials` and `d` with `disabled`, and errors name `b` and `c` with their messages, in that order.
- `AUTHN-7: a failure during the lookup in order fails the revalidation`: *given* no recorded provider, `a` throwing and `b` returning `null`, *then* `revalidate` rejects with a message starting `session/revalidation-failed: a:`.
- `AUTHN-7: the lookup in order takes the first identity`: *given* no recorded provider, `a` returning `ada` and `b` returning the same subject with another email, *then* `ada`.

`packages/core/src/lib/script/auth/auth.server.test.ts` (unit). The `refreshSession` mock calls the `revalidate` it receives with a family of subject `subject-1` and provider `b`, and answers as AUTHN-7 says: `null` gives `rejected`, a thrown error propagates, an `Identity` gives `refreshed` with its email. `revalidate` from `./providers.server` is a mock that records its arguments.
- `AUTHN-6: a session records the provider that signed it in`: unchanged, except that `signIn` signs in with provider `b`, as this RFC already said, not `array`.
- `AUTHN-7: a refresh revalidates the family's subject with its recorded provider`: *given* an expired access token, *then* `revalidate` was called once, with `subject-1` and `b`.
- `AUTHN-7: a failed revalidation fails the request and leaves the cookie`: *given* `revalidate` throwing, *then* `authenticateRequest` rejects with that error and the cookie jar is unchanged.
- `AUTHN-7: the renewed access token carries the email revalidation returned`: *given* `revalidate` returning `ada@new.example.com`, *then* the renewed access token's `email` is `ada@new.example.com`.
- `AUTHN-7: a gone identity clears the session`: *given* `revalidate` returning `null`, *then* the request is anonymous and the cookie is cleared.

`packages/core/src/lib/script/auth/session.server.test.ts` (unit):
- `AUTHN-6: the provider survives a rotation`: *given* `startSession(identity, 'b')` and one refresh, *then* the stored family still has `provider: 'b'`, and the next refresh's `revalidate` receives `b`.

`packages/config/src/host/host.test.ts` (unit): test 13 runs on a manifest whose providers are `second`, then `first`, *then* `authenticationProviderKeys` is `['second', 'first']`.

`packages/authentication-adapter-array/src/runtime.test.js` (unit):
- `AUTHN-4: an email is not a subject`: *given* the entry `ada`, *then* `getIdentity('ada@example.com')` returns `null`.

`packages/conformance/src/authentication.js` (conformance), as §Specification's amendment, with the new test `AUTHN-2: a disabled identity's wrong password is rejected for credentials`. `packages/conformance/test/mutants/authentication.js` gains one mutant per new check, and the CONF-4 mutant test still expects each to fail exactly its test: the identity carries another email (`the fixture's credentials return its identity`); `getIdentity` returns a stale email (`getIdentity returns the fixture's identity`); the empty password signs in (`a wrong password is rejected for credentials`); `disabled` is answered before the password is checked (`a disabled identity's wrong password is rejected for credentials`). The mutant `a disabled identity signs in` returns the identity only for the disabled entry's correct password, so that it fails one test.

**Second amendment (CS2).** Written from CF16 to CF21. Where an existing test changes, its title stays.

`packages/core/src/lib/script/auth/providers.server.test.ts` (unit). Beside `console.warn` and `console.error`, the test spies on `console.log`, `console.info` and `console.debug`.
- `AUTHN-5: tries the providers in config order, not sorted order`: *given* providers `b`, rejecting `credentials`, then `a`, returning `ada`, *then* the calls are `b.authenticate`, `a.authenticate` and the result names `a`.
- `AUTHN-5: a second-factor rejection stops the trial and is logged`: *given* `a` rejecting `second-factor-required` and `b` returning `ada`, *then* `invalid-credentials`, only `a` was called, and the warning names `a` with `second-factor-required`.
- `AUTHN-5: only a message starting authentication/throttled is throttled`: also *given* one provider throwing `authentication/rate-limited`, *then* `sign-in-unavailable`.
- `AUTHN-5: several failures, none throttled, read as unavailable`: *given* `a` and `b` both throwing `authentication/provider-failed`, *then* `sign-in-unavailable`.
- `AUTHN-5: a stopping rejection after a throttled provider fails as invalid credentials`: *given* `a` throwing `authentication/throttled` and `b` rejecting `disabled`, *then* `invalid-credentials`.
- `AUTHN-5: a provider that fails to construct is logged`: *given* `host.authentication('a')` rejecting with `provider/secret-unavailable: a`, *then* one error names `a` with that message.
- `AUTHN-5: logs rejections and failures without the email or password`: the providers are now `a` rejecting, `b` throwing and `c` returning `ada`, and no line on any of the five channels contains the email or the password.
- `AUTHN-5: returns the provider's identity unchanged`: *given* `a` returning `{ subject: 's-ada', email: 'Ada@Example.COM' }`, *then* that identity, as given.
- `AUTHN-5: no provider configured reads as unavailable`: *given* no provider, *then* `sign-in-unavailable` and the error `[genoacms:auth] no authentication provider is configured`.
- `AUTHN-7: a gone identity at the recorded provider is not looked up elsewhere`: *given* `a` knowing `ada`, `b` returning `null` and provider `b`, *then* `null`, and only `b.getIdentity` was called.
- `AUTHN-7: the lookup in order follows config order and stops at the first identity`: *given* `b`, returning `ada` with the email `ada@b.example.com`, then `a`, returning `ada`, *then* `b`'s identity and only `b.getIdentity` was called; *and given* `a` returning `ada` and `b` throwing, *then* `ada`.
- `AUTHN-7: a failure in the lookup in order moves on to the next provider`: *given* no recorded provider, `a` throwing and `b` returning `ada`, *then* `ada`.
- `AUTHN-7: a throttled provider fails the revalidation`: *given* the recorded provider `b` throwing `authentication/throttled`, *then* `revalidate` rejects with a message starting `session/revalidation-failed: b:`.
- `AUTHN-7: revalidation returns the provider's identity unchanged`: *given* `b` returning `ada` with the email `Ada@New.Example.com`, *then* that identity, as given.

`packages/core/src/lib/script/auth/auth.server.test.ts` (unit). The mocked host has the keys `a`, `b` and `c`. The mocked `resolvePrincipal` records its argument. The family the `refreshSession` mock revalidates is configurable, and has provider `b` by default.
- `AUTHN-5: authorization is asked about the subject`: *given* a sign-in, *then* `resolvePrincipal` received `subject-1` and nothing else.
- `AUTHN-5: a sign-in authorization does not know fails as invalid credentials`: also *then* no session was started.
- `AUTHN-7: a family without a provider is revalidated without one`: *given* a family that records no provider, *then* `revalidate` received `subject-1` and `undefined`.
- `AUTHN-7: the renewed access token carries the email revalidation returned`: the email is now `Ada@New.Example.com`, carried as given.

`packages/core/src/lib/script/auth/session.server.test.ts` (unit):
- `AUTHN-7: a gone identity whose family cannot be removed fails the refresh`: *given* `revalidate` returning `null` and the storage delete failing once, *then* `refreshSession` rejects with that failure, the family is still stored, and the next refresh, with the delete working, is `rejected` with `identity-gone`.

`packages/config/src/host/host.test.ts` (unit): test 13 runs on three providers, `third`, `second`, `first`, *then* `authenticationProviderKeys` is `['third', 'second', 'first']`, and nothing was loaded once a macrotask has passed.

`packages/conformance/src/authentication.js` (conformance), as §Specification's second amendment. `packages/conformance/test/mutants/authentication.js` gains, each failing exactly its test: a password compared without case for the fixture (`a wrong password is rejected for credentials`); the disabled identity answering `disabled` to the empty password (`a disabled identity's wrong password is rejected for credentials`); `getIdentity` answering the fixture's email (`getIdentity returns null for an unknown subject`); the fixture's credentials answered only once (`the fixture's credentials return its identity`).

Not tested, by decision: an empty email from `getIdentity`, which no adapter has a reason to return, and a lockout after wrong passwords, which AUTHN-3 requires to throw, so the suite cannot tell it from an outage.

No test of this RFC carries AUTHN-3: the array adapter has no service that can fail. It stays unverified until an adapter with a service tests it by fault injection (RFC-0032).

Levels: AUTHN-5 to AUTHN-7 are declared `e2e` in `contracts/authentication.md`, but core has no end-to-end tests that run in CI (`docs/README.md`, known gaps). Step 6 changes their level to `unit`, which these tests are; the author confirms or keeps `e2e`, which would leave `main` not releasable.

## Steps

1. Baseline: `node scripts/test-level.mjs unit` and `node scripts/test-level.mjs conformance` pass; `pnpm run docs:check` reports 0 errors. Record the counts.
2. Tests: written from this RFC by an agent that has not seen the implementation, marked `it.fails` where they do not yet pass, and committed: `test: the authentication contract's tests, expected to fail until implemented (RFC-0030)`.
3. Contracts and the array adapter (§Specification), then the conformance suite and its mutant test.
4. The host's keys, then core: `providers.server.ts`, `session.ts`, `session.server.ts`, `auth.server.ts`, the login route and page. Delete `lib/script/providers.server.ts`.
5. Remove the `it.fails` markers without changing an assertion; run §Verification.
6. Documents, committed separately: AUTHN-2 to AUTHN-7 and CONF-4 lose their `State`, name their test files, and AUTHN-5's text becomes this RFC's; their levels as the author confirmed; `host.md`'s `Host`; `contracts/authentication.md` CF4 fixed, CF3 mitigated, CF5 fixed; `verified` updated; this RFC `implemented` with its commits.
7. A falsification audit of AUTHN-2 to AUTHN-7 and CONF-4 by an agent that did not write the code, recorded as a `CS` entry.

*Amendment*, after CS1:

8. Documents: AUTHN-5 and CONF-4 as amended; CF10 to CF15 open, fixed by this RFC; this RFC `draft`.
9. Tests: the amendment's tests (§Tests), marked `it.fails` where they do not yet pass, committed: `test: the tests CS1 showed missing, expected to fail until fixed (RFC-0030)`.
10. Code, only where a test of step 9 fails; then remove the `it.fails` markers without changing an assertion.
11. Documents: CF10 to CF15 fixed; AUTHN-7 names `auth.server.test.ts`; `verified`; this RFC `implemented` with all its commits.
12. A falsification audit of AUTHN-5 to AUTHN-7 and CONF-4 by an agent that wrote neither the code nor the amendment's tests, recorded as a `CS` entry.

*Second amendment*, after CS2:

13. Documents: AUTHN-5, AUTHN-7 and CONF-4 as amended; CF16 to CF21 open, fixed by this RFC; this RFC `draft`.
14. Tests: the second amendment's tests, marked `it.fails` where they do not yet pass, committed separately.
15. Code: `signIn` with no provider, the lookup in order, the removal on `identity-gone`; then remove the `it.fails` markers without changing an assertion.
16. Documents: CF16 to CF21 fixed; `verified`; this RFC `implemented` with all its commits.
17. A falsification audit of AUTHN-5, AUTHN-7 and CONF-4 by an agent that wrote neither the code nor these tests, recorded as a `CS` entry.

## Verification

```bash
pnpm -r --filter '!@genoacms/core' run build
# every package builds
node scripts/test-level.mjs unit
# passes; core's and the array adapter's reports hold the AUTHN tests
node scripts/test-level.mjs conformance
# passes; the authentication suite runs against the memory adapter and the array adapter
pnpm --filter @genoacms/core run check
# no error in the files this RFC touches; 119 errors remain elsewhere, all older than this RFC
pnpm run docs:check
# 0 errors
```

*Amendment.* The 16 mutations CS1 found passing, run again with the script CS1 used: each now fails a
test. The 5 adapters CS1 found passing CONF-4 now fail it.

*Second amendment.* The 37 mutations and adapters CS2 found passing, minus those §Tests leaves untested by decision, now fail a test.

## Critique

**Pros**
- One change makes every adapter answer the two questions core needs, and the conformance suite holds every adapter to them.
- A disabled user is signed out at the next refresh; an outage no longer looks like a wrong password; operators see why sign-ins fail.
- Providers are constructed only when reached, so a broken provider late in the order costs nothing until needed.

**Cons & trade-offs**
- Breaking for every authentication adapter, third-party ones included, and for `Host` users of `authenticationProviders`.
- Every refresh calls a provider; during a provider outage, users whose access token expires get a 500 until it returns.
- Trying providers in order makes a sign-in to the last provider as slow as all earlier calls together.
- *Second amendment.* A family without a provider can be revalidated by a later provider while an earlier one is down. Where two providers hold the same subject (`identities.md` ID4), that may be the wrong one; it already was for an earlier provider returning `null`.
- *Second amendment.* A logout in another tab while the identity is gone can make the delete fail once; that request fails, and the next finds no family.

**Blindspots & missed edge cases**
- Renaming a provider's key in the config ends every session it signed in, because revalidation cannot tell a rename from a removal.
- Two providers holding the same subject (`identities.md` ID4) make revalidation of an old family, which records no provider, pick the first.
- The `concurrent` path issues a fresh access token without revalidation, for the length of the grace window.
- The login page's messages are English only, as the rest of the page is.
