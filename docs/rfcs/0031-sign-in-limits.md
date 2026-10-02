---
type: rfc
number: 31
title: Core limits failed sign-ins
status: draft
commits: []
depends: [30]
architecture: [architecture/contracts/authentication.md, architecture/contracts/README.md]
changes: [AUTHN-5 compatible, AUTHN-8 added, AUTHN-9 added, AUTHN-10 added, AUTHN-11 added]
commit-subject: "feat(core): limit failed sign-ins per email and address, and per address (AUTHN-8 to AUTHN-11)"
---

# RFC-0031: Core limits failed sign-ins

## Summary

Nothing limits failed sign-ins (CF1). Every attempt reaches every provider, the array adapter and
self-owned stores have no protection of their own, and a managed provider sees one abusive client:
the server. CU4 and CD7 decided the fix:

1. before any provider is called, core counts recent failures for the pair of normalized email and
   client address, and for the address alone, and refuses the attempt with `too-many-attempts` at 5
   and 50 failures within 15 minutes (AUTHN-8);
2. an `invalid-credentials` failure is recorded for both keys; a successful sign-in clears the pair
   (AUTHN-9);
3. the counters are small objects in the default bucket, written with generation preconditions
   (AUTHN-10);
4. the three numbers are security-policy values, seeded by the config's `security` stanza (AUTHN-11).

AUTHN-5 regains the clauses RFC-0030 left out: the limits come first, and a refusal by the limits is
`too-many-attempts`.

## Files

**Modify or create only:**

| File | Change |
| :-- | :-- |
| `packages/config/src/config.ts` | `SecurityConfig` gains the three optional fields, with doc comments |
| `packages/core/src/lib/script/securityPolicy/policy.ts` | three numeric fields, their bounds, and optional parsing (§Specification) |
| `packages/core/src/lib/script/securityPolicy/policy.server.ts` | defaults; a stored policy without the fields is completed |
| `packages/core/src/lib/script/securityPolicy/policy.test.ts` | §Tests |
| `packages/core/src/lib/script/auth/limits.ts` | create: pure functions: email normalization, keys, the window |
| `packages/core/src/lib/script/auth/limits.test.ts` | create |
| `packages/core/src/lib/script/auth/limits.server.ts` | create: reading and writing the counter objects |
| `packages/core/src/lib/script/auth/limits.server.test.ts` | create |
| `packages/core/src/lib/script/auth/auth.server.ts` | `login(email, password, cookies, address)` applies the limits |
| `packages/core/src/lib/script/auth/auth.server.test.ts` | §Tests |
| `packages/core/src/routes/login/+page.server.ts` | passes `getClientAddress()`, or `unknown` when it throws |
| `docs/architecture/contracts/authentication.md`, `README.md` | statements current (step 6) |

## Specification

AUTHN-8 to AUTHN-11 stand as written in `contracts/authentication.md`. AUTHN-5 becomes its full text
there. The implementation:

### `limits.ts` (pure)

```ts
/** identities.md IDS-1: trim Unicode White_Space, NFC, default lowercase. */
declare function normalizeEmail (email: string): string
declare function pairKey (email: string, address: string): string      // 'pair-' + sha256hex(normalizeEmail(email) + '\n' + address)
declare function addressKey (address: string): string                  // 'address-' + sha256hex(address)
interface Failures { failures: number[] }                             // ms since the epoch, oldest first
declare function parseFailures (raw: unknown): Failures                // anything malformed reads as { failures: [] }
declare function recent (f: Failures, now: number, windowMinutes: number): number[]  // within (now - window, now]
declare function withFailure (f: Failures, now: number, windowMinutes: number, limit: number): Failures
                                                                      // recent(f) + [now], keeping the last `limit`
declare function isExceeded (f: Failures, now: number, windowMinutes: number, limit: number): boolean
                                                                      // recent(f).length >= limit
```

`normalizeEmail` is `email.replace(/^\p{White_Space}+|\p{White_Space}+$/gu, '').normalize('NFC').toLowerCase()`.
A malformed counter object reads as empty rather than failing the sign-in: the counters are not
signed (CD7), and an unreadable one is no evidence of an attack.

### `limits.server.ts`

```ts
declare function checkLimits (email: string, address: string): Promise<'allowed' | 'too-many-attempts'>
declare function recordFailure (email: string, address: string): Promise<void>
declare function clearPair (email: string, address: string): Promise<void>
```

- Objects are `.genoacms/security/sign-in/<key>.json` in the default bucket, read with their version.
  An absent object is `{ failures: [] }`.
- `checkLimits` reads both objects; any read error other than absence throws, and `login` turns it
  into `sign-in-unavailable` (AUTHN-8).
- `recordFailure` updates each object with `withFailure`, conditional on the version read
  (`ifVersion`) or on absence (`ifAbsent`); on a precondition failure it reads again and retries, at
  most three attempts per object. When an object still cannot be written, it logs
  `console.warn('[genoacms:auth] could not record a failed sign-in: <message>')` and returns. It never
  throws (AUTHN-9).
- `clearPair` deletes the pair's object; absence is success; an error is logged as above and swallowed.

### `login`

```ts
declare function login (email: string, password: string, cookies: Cookies, address: string): Promise<void>
```

```pseudo
if await checkLimits(email, address) is 'too-many-attempts': throw SignInError('too-many-attempts')
   (a throw of checkLimits: throw SignInError('sign-in-unavailable'))
result = signIn(email, password)                      // RFC-0030
if result failed with invalid-credentials, or the identity is not a known principal:
  await recordFailure(email, address); throw SignInError('invalid-credentials')
if result failed: throw SignInError(result.failure)  // nothing recorded
await clearPair(email, address)
start the session, as RFC-0030
```

The login route calls `login(username, password, cookies, address)`, where `address` is
`getClientAddress()`, or `'unknown'` when it throws.

### The policy

| Field | Default | Bounds |
| :-- | :-- | :-- |
| `signInFailuresPerPair` | 5 | 1 to 100 |
| `signInFailuresPerAddress` | 50 | 1 to 10,000 |
| `signInWindowMinutes` | 15 | 1 to 1,440 |

`parseSecurityPolicy` accepts a payload without these three fields and completes them from the
Tier-1 values (the stanza, else the defaults); present, they are validated like the other numeric
fields, with `policy.<field> must be between <min> and <max>`. The other fields stay required.
`policyBounds()` includes the three. `defaultPolicy()` seeds them from the stanza.

## Non-goals

- A sweep of old counter objects. CD7's cost asks operators for a lifecycle rule; `genoa` does not set one.
- Changing the security-policy screen. It shows what `policyBounds()` lists, if it lists it generically; making it show the new fields well is a separate change.
- Normalizing IPv6 addresses beyond what the hosting layer reports.
- Limiting anything but password sign-in, such as refreshes.

## Tests

**`packages/core/src/lib/script/auth/limits.test.ts`** (unit):
- `AUTHN-8: normalizes the email as IDS-1 does`: *given* `'  Ada@Example.COM　'` and `'ada@example.com'`, *then* both normalize to `'ada@example.com'`; *given* a decomposed `'ä'` and the composed `'ä'`, *then* the same; a property-based test over arbitrary strings: normalizing twice equals normalizing once.
- `AUTHN-10: derives the object keys`: *given* `ada@example.com` and `203.0.113.9`, *then* the pair key is `pair-` plus the SHA-256 of `ada@example.com\n203.0.113.9` and the address key `address-` plus the SHA-256 of `203.0.113.9`, both lowercase hexadecimal, computed independently in the test with `node:crypto`.
- `AUTHN-8: counts only failures within the window`: *given* failures at now − 16 min, now − 14 min and now, a 15-minute window, *then* `recent` holds the last two; at exactly now − 15 min, the failure is out.
- `AUTHN-8: a limit is reached at the limit, not after it`: *given* 4 recent failures and limit 5, *then* not exceeded; 5, exceeded.
- `AUTHN-10: keeps at most the limit, oldest dropped`: *given* 5 recent failures and limit 5, *when* one is added, *then* 5 remain and the oldest is gone.
- `AUTHN-10: a malformed counter reads as empty`: *given* `null`, `{}`, `{ failures: 'x' }`, `{ failures: [1, 'x'] }`, *then* each parses to `{ failures: [] }`.

**`packages/core/src/lib/script/auth/limits.server.test.ts`** (unit; integration: the in-memory storage provider of `session.server.test.ts`, with real preconditions):
- `AUTHN-8: refuses at the pair's limit`: *given* 5 recorded failures for one email and address, *then* `checkLimits` returns `too-many-attempts`; for the same email from another address, `allowed`.
- `AUTHN-8: refuses at the address's limit`: *given* 50 failures from one address across 50 emails, *then* a 51st email from that address is refused, and the same email from another address is allowed.
- `AUTHN-8: an unreadable counter fails closed`: *given* storage failing reads with an error other than absence, *then* `checkLimits` rejects.
- `AUTHN-10: writes the objects where the document says`: *given* one recorded failure, *then* the bucket holds exactly `.genoacms/security/sign-in/pair-<h>.json` and `address-<h>.json`, each `{ "failures": [<now>] }`.
- `AUTHN-10: concurrent failures are all recorded`: *given* 4 `recordFailure` calls at once for one key on storage that enforces preconditions, *then* the object holds 4 failures.
- `AUTHN-10: gives up after three attempts without throwing`: *given* storage that fails every conditional write with a precondition failure, *then* `recordFailure` resolves, made exactly three write attempts per object, and logged one warning.
- `AUTHN-9: clearing removes the pair and keeps the address`: *given* recorded failures, *when* `clearPair` runs, *then* the pair's object is gone and the address's remains.

**`packages/core/src/lib/script/auth/auth.server.test.ts`** (unit), `./limits.server` and `./providers.server` mocked:
- `AUTHN-8: a refused attempt reaches no provider`: *given* `checkLimits` refusing, *then* `login` throws `too-many-attempts`, `signIn` was not called, and nothing was recorded.
- `AUTHN-8: an unreadable counter makes sign-in unavailable`: *given* `checkLimits` rejecting, *then* `sign-in-unavailable`, and `signIn` was not called.
- `AUTHN-9: a wrong password is recorded`: *given* `signIn` failing `invalid-credentials`, *then* `recordFailure` ran once with the email and address.
- `AUTHN-9: an unknown principal is recorded as a wrong password`: *given* an identity authorization does not know, *then* `invalid-credentials` and `recordFailure` ran.
- `AUTHN-9: an outage or a throttled provider records nothing`: *given* `sign-in-unavailable`, and then `too-many-attempts`, *then* `recordFailure` did not run.
- `AUTHN-9: a success clears the pair`: *given* a successful sign-in, *then* `clearPair` ran once and `recordFailure` did not.
- `AUTHN-9: a failure to record does not change the outcome`: *given* `recordFailure` logging and resolving, *then* `login` still throws `invalid-credentials`.

**`packages/core/src/lib/script/securityPolicy/policy.test.ts`** (unit):
- `AUTHN-11: a stored policy without the limits is valid and completed`: *given* a payload with every older field and none of the three, *then* it parses, with 5, 50 and 15.
- `AUTHN-11: each limit is bounded`: for each field, *given* its min and max, *then* valid; min − 1, max + 1 and a non-integer, *then* refused with `policy.<field> must be between <min> and <max>` or `is not an integer`.
- `AUTHN-11: the stanza seeds the limits`: *given* a stanza with `signInFailuresPerPair: 7`, *then* the default policy holds 7.

The login route's address fallback is checked by the e2e-level statement AUTHN-8 once core's
end-to-end tests run in CI; until then, AUTHN-8 and AUTHN-9 keep `e2e` only if the author keeps it
(as RFC-0030 asks for AUTHN-5).

## Steps

1. Baseline: as RFC-0030's, after RFC-0030 is implemented.
2. Tests, written from this RFC by an agent that has not seen the implementation, marked `it.fails`, committed: `test(core): sign-in limits' tests, expected to fail until implemented (RFC-0031)`.
3. `config.ts`, then the policy (`policy.ts`, `policy.server.ts`).
4. `limits.ts`, `limits.server.ts`, then `login` and the route.
5. Remove the markers without changing an assertion; run §Verification.
6. Documents, separately: AUTHN-5 and AUTHN-8 to AUTHN-11 current with their test files; CF1 fixed; `verified`; this RFC `implemented`.
7. A falsification audit of AUTHN-5 and AUTHN-8 to AUTHN-11, recorded as a `CS` entry.

## Verification

```bash
pnpm --filter @genoacms/config run build
# builds
node scripts/test-level.mjs unit
# passes; core's report holds the AUTHN-8 to AUTHN-11 tests
pnpm --filter @genoacms/core run check
# 0 errors
pnpm run docs:check
# 0 errors
```

## Critique

**Pros**
- One limit covers every adapter, without adapters knowing.
- A stranger cannot lock an owner out from another address; one address cannot spray many accounts.
- Existing stored policies stay valid; the limits are tunable without a deploy.

**Cons & trade-offs**
- Two storage reads per sign-in, and two conditional writes per failure.
- A distributed guess against one account is bounded per address only (CD7).
- Counter objects accumulate until an operator sets a lifecycle rule.

**Blindspots & missed edge cases**
- A burst of concurrent attempts is checked before any is recorded, so it can pass the limit by its own size.
- The `unknown` address is shared by every client a platform cannot identify; behind such a platform, 50 failures anywhere refuse everyone for 15 minutes.
- An older core reading a policy written with the new fields refuses it as unexpected fields and falls back to its defaults; rolling back across this RFC resets the live policy to the Tier-1 values until it is edited again.
- Address strings are compared as reported: an IPv4-mapped IPv6 address and its IPv4 form are two keys.
