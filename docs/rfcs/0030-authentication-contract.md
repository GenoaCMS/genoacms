---
type: rfc
number: 30
title: The authentication contract, sign-in across providers, and session revalidation
status: implemented
commits: [fe9d371]
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

### The conformance suite (CONF-4)

`runAuthenticationConformance(adapter, fixture)` as CONF-4 states, registered as
`suite('authentication conformance', …)`. Its tests and their titles are in §Tests. The
`credentials` checks use the fixture's email with the password `fixture.identity.password + '-wrong'`,
and the email `conformance-unknown-<random UUID>@example.invalid`.

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

## Critique

**Pros**
- One change makes every adapter answer the two questions core needs, and the conformance suite holds every adapter to them.
- A disabled user is signed out at the next refresh; an outage no longer looks like a wrong password; operators see why sign-ins fail.
- Providers are constructed only when reached, so a broken provider late in the order costs nothing until needed.

**Cons & trade-offs**
- Breaking for every authentication adapter, third-party ones included, and for `Host` users of `authenticationProviders`.
- Every refresh calls a provider; during a provider outage, users whose access token expires get a 500 until it returns.
- Trying providers in order makes a sign-in to the last provider as slow as all earlier calls together.

**Blindspots & missed edge cases**
- Renaming a provider's key in the config ends every session it signed in, because revalidation cannot tell a rename from a removal.
- Two providers holding the same subject (`identities.md` ID4) make revalidation of an old family, which records no provider, pick the first.
- The `concurrent` path issues a fresh access token without revalidation, for the length of the grace window.
- The login page's messages are English only, as the rest of the page is.
