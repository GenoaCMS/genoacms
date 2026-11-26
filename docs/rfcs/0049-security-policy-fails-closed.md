---
type: rfc
number: 49
title: The security policy has a sequence, and a damaged one fails closed
status: auditing
commits: [15f94f50]
audit: []
depends: [48]
architecture: [architecture/signing.md]
changes: [POL-1 added, POL-2 added, POL-3 added, POL-4 added]
commit-subject: "feat(core)!: a sequenced security policy that fails closed when damaged (RFC-0049)"
---

# RFC-0049: The security policy has a sequence, and a damaged one fails closed

## Summary

Three findings of `signing.md`, each letting whoever can write the storage loosen the policy an
administrator set, without any key:

- YF3: every policy the root ever signed verifies, so an older, looser one can be put back.
- YF4: a damaged policy puts the instance on the configured defaults, which may be looser.
- YF8: a failed read of the policy does the same, silently.

The author decided on 2026-11-25 (YU3):

1. The policy becomes `genoacms.securityPolicy.v2`, with a `sequence` (POL-1), and the secret
   `GENOACMS_SECURITY_POLICY_SEQUENCE` holds its mark, as the key manifest's does (POL-2).
2. A policy that is not JSON, does not verify, is of another type, breaks its bounds, is below the
   mark, or whose mark cannot be read, is **damaged** (POL-3). Only absence creates a policy; any
   other failure to read propagates (POL-1, YF8).
3. While damaged, sign-in keeps working on the strictest bounds, publishing refuses, the current key
   does not rotate when due, and the security screen says so and lets an administrator rewrite the
   policy (POL-3). Nothing replaces the damaged document but that write.
4. Root rotation writes a v2 policy (POL-4). A stored v1 policy is damaged; migrating it is not
   part of GenoaCMS (YD10), and rewriting it on the security screen ends the damage.

## Files

**Modify or create only:**

| File | Change |
| :-- | :-- |
| `packages/core/src/lib/script/signing/envelope.ts` | `DOCUMENT_TYPES` replaces `'genoacms.securityPolicy.v1'` with `'genoacms.securityPolicy.v2'` |
| `packages/core/src/lib/script/signing/secretNames.ts` | `POLICY_SEQUENCE_SECRET = 'GENOACMS_SECURITY_POLICY_SEQUENCE'` |
| `packages/core/src/lib/script/signing/sequenceMark.server.ts` | new: `readMark`, `checkAndAdvanceMark`, `recordMark`, by secret name, moved out of `registrySequence.server.ts` |
| `packages/core/src/lib/script/signing/registrySequence.server.ts` | its three functions call `sequenceMark.server.ts` with `REGISTRY_SEQUENCE_SECRET`; messages unchanged |
| `packages/core/src/lib/script/securityPolicy/policy.ts` | `StoredSecurityPolicy`, `parseStoredPolicy`, `STRICTEST_ACCESS` |
| `packages/core/src/lib/script/securityPolicy/policy.server.ts` | v2; `readStoredPolicy` by POL-1 to POL-3; `writePolicy` by POL-2; `accessPolicy`, `governingPolicy` replace `loadSecurityPolicy` |
| `packages/core/src/lib/script/securityPolicy/user.server.ts` | the screen's read reports `damaged`; the write by POL-2 |
| `packages/core/src/lib/script/auth/auth.server.ts`, `auth/session.server.ts`, `authorization/grants.server.ts` | `accessPolicy()` |
| `packages/core/src/lib/script/components/publication/index.ts` | `governingPolicy()`, refusing while damaged |
| `packages/core/src/lib/script/signing/keyResolution.server.ts`, `signing/user.server.ts` | `governingPolicy()` |
| `packages/core/src/lib/script/bootstrap.server.ts` | `governingPolicy()`, so a damaged policy does not stop the start |
| `packages/core/src/lib/script/signing/rootRotation.server.ts` | POL-4 |
| `packages/core/src/routes/(admin)/configuration/security/DegradedNotice.svelte` | POL-3's text |
| `packages/core/src/lib/script/testing/signingKeys.ts` | `testPolicyReaders` (§Tests) |
| `packages/core/src/lib/script/securityPolicy/policy.test.ts`, `policy.server.test.ts` (new), `user.server.test.ts` | by §Tests |
| `packages/core/src/lib/script/signing/sequenceMark.server.test.ts`, `signing/keyResolution.server.test.ts` | new, by §Tests |
| `packages/core/src/lib/script/auth/*.test.ts`, `components/publication/*.test.ts`, `signing/user.server.test.ts`, `bootstrap.test.ts`, and every other unit test that mocks `policy.server` | the policy mocks answer `accessPolicy` and `governingPolicy`; no assertion changes but the two §Tests names |
| `packages/core/e2e/securityPolicy.test.ts` | new, by §Tests |
| `docs/architecture/adapter-gcp/secrets.md` | its *Role* names the second mark |
| `packages/docs/src/routes/guide/storage-layout/+page.md`, `guide/cli/+page.md` | the policy's sequence and damage; root rotation resets the policy |
| `packages/docs/src/routes/guide/config/services/+page.md` | the second mark |
| `.changeset/security-policy-fails-closed.md` | `@genoacms/core` minor |
| `docs/architecture/signing.md` | after the code: POL-1 to POL-4 current, YF3, YF4 and YF8 fixed, test files named, `verified` |
| `docs/README.md`, `docs/rfcs/README.md` | the rows of `signing.md` and this RFC; Coverage's *Core: security policy* row |

## Specification

New statements, as `signing.md` holds them in this RFC's architecture commit: POL-1 to POL-4.

```ts
// policy.ts
interface StoredSecurityPolicy extends SecurityPolicy {
  sequence: number
}

function parseStoredPolicy (payload: unknown): { ok: true, policy: StoredSecurityPolicy } | { ok: false, reason: string }

const STRICTEST_ACCESS = {
  accessTokenMinutes: MIN_ACCESS_TOKEN_MINUTES,
  refreshTokenDays: MIN_REFRESH_TOKEN_DAYS,
  grantCacheSeconds: MIN_GRANT_CACHE_SECONDS
} as const
```

`parseStoredPolicy` checks `sequence` first, `policy.sequence is not a positive integer`, then
everything `parseSecurityPolicy` checks, with its reasons; an unexpected member fails with
`policy has unexpected fields: <names>`.

```ts
// policy.server.ts
const POLICY_DOCUMENT = 'genoacms.securityPolicy.v2'

type StoredPolicy =
  | { state: 'trusted', policy: StoredSecurityPolicy, version?: string }
  | { state: 'damaged', reason: string, version?: string }

async function readStoredPolicy (): Promise<StoredPolicy>

type AccessPolicy = Pick<SecurityPolicy, 'accessTokenMinutes' | 'refreshTokenDays' | 'grantCacheSeconds'>
async function accessPolicy (): Promise<AccessPolicy>

type GoverningPolicy = { ok: true, policy: SecurityPolicy } | { ok: false, reason: string }
async function governingPolicy (): Promise<GoverningPolicy>

async function writePolicy (policy: SecurityPolicy, stored: StoredPolicy): Promise<StoredSecurityPolicy>
```

`readStoredPolicy`, in order:

1. Reads the document. On `ObjectNotFoundError` (`isNotFound`) it reads the mark: above 0, the
   policy is damaged with `policy-absent: nothing is stored, but the mark is <mark>`; absent or 0, it
   creates the configured policy with sequence 1, `ifAbsent`, records the mark, and returns it
   trusted, and when the creation's precondition fails it reads again once. Any other error
   propagates.
2. Damaged, with these reasons: `not JSON`; `policy-needs-migration: the stored policy is genoacms.securityPolicy.v1, which this version of core does not read`
   for an envelope whose `type` member is v1, compared before verifying; `signature: <reason>` from `readRootSignedDocument`; the reason of
   `parseStoredPolicy`; `policy-sequence/unreadable: GENOACMS_SECURITY_POLICY_SEQUENCE is '<value>'`;
   `policy-rollback: sequence <sequence> is below the highest seen (<mark>)`.
3. Otherwise trusted, raising the mark when the sequence is above it.

Each damaged read logs once per reason and process
`[genoacms:security] .genoacms/security/policy.json is damaged (<reason>). Sign-in runs on the strictest token lifetimes and publishing is refused until an administrator rewrites the policy on /configuration/security.`.

`accessPolicy` returns the trusted policy's three values, or `STRICTEST_ACCESS` when damaged.
`governingPolicy` returns `{ ok: true, policy }` when trusted, `{ ok: false, reason }` when damaged.
Both propagate what `readStoredPolicy` propagates.

`writePolicy(policy, stored)` writes
`{ ...policy, sequence: max(trusted sequence or 0, mark) + 1 }`, conditional on `stored.version`
(`ifAbsent` when it has none), then records the mark, and returns what it wrote.

`publishComponent` (`components/publication/index.ts`), when `governingPolicy()` is not `ok`,
throws `security-policy/damaged: <reason>. An administrator must rewrite it on /configuration/security.`
before it compiles anything. `currentRegistryAfterDueRotation` skips the due check when it is not
`ok`, as it does today when the read throws; it still propagates a thrown read. `rotationOf`
(`signing/user.server.ts`) shows the policy as unreadable, as today.

`bootstrap.server.ts` calls `governingPolicy()` and ignores a damaged answer, so the instance
starts and serves sign-in and the security screen.

`securityPolicy/user.server.ts`: the screen's read returns, when damaged, the configured defaults,
`version`, and `degraded: <reason>`; saving calls `writePolicy(parsed, stored)` with the
`readStoredPolicy` answer it read, so a changed document fails with today's message.
`DegradedNotice.svelte` shows POL-3's two sentences.

```ts
// sequenceMark.server.ts
type MarkVerdict = { ok: true, advanced: boolean } | { ok: false, seen: number, mark: number }

async function readMark (secret: string, unreadable: (value: string) => string): Promise<number>
async function checkAndAdvanceMark (secret: string, sequence: number, unreadable: (value: string) => string): Promise<MarkVerdict>
async function recordMark (secret: string, sequence: number, unreadable: (value: string) => string): Promise<void>
```

Format by REG-4. `unreadable` builds the message, so each mark keeps its own:
`registry-sequence/unreadable: …` for the manifest, `policy-sequence/unreadable: …` for the
policy.

`rotateRootKey` writes the configured policy with `sequence = policy mark + 1`, unconditionally,
then records the mark.

## Non-goals

- Migrating a stored `genoacms.securityPolicy.v1` policy (YD10).
- The bounds, the members and their meanings, apart from `sequence`.
- Caching the policy: every call reads it, as today. RES-4's grant cache keeps the value it first
  read.
- Repairing the policy anywhere but the security screen; no command rewrites a damaged policy.
- Sign-in limits (`contracts/authentication.md` CD7, RFC-0031), which are not policy members yet.
- Sessions and tokens issued before the damage keep their lifetimes.
- YF7.

## Tests

`securityPolicy/policy.test.ts` (unit):

- `POL-1: a stored policy needs a sequence of at least 1`: for 0, `1.5` and an absent member, then
  `policy.sequence is not a positive integer`.
- `POL-1: a stored policy refuses an unexpected member`: then `policy has unexpected fields: x`.
- `POL-3: the strictest access values are the lower bounds`: `STRICTEST_ACCESS` is
  `{ accessTokenMinutes: 1, refreshTokenDays: 1, grantCacheSeconds: 0 }`.

`securityPolicy/policy.server.test.ts` (unit), new, on in-memory storage and secrets with the test
root key:

- `POL-1: an absent policy is created from the configuration with sequence 1`: then the stored
  envelope is v2, its payload the configured values with `sequence: 1`, and the mark is 1.
- `POL-1, POL-3: a deleted policy is damaged, not recreated, once a mark exists`: given the mark 3
  and nothing stored, then `damaged` with `policy-absent: nothing is stored, but the mark is 3`, and
  nothing is written.
- `POL-1, YF8: a failed read propagates and creates nothing`: given the storage throws a
  non-not-found error, then `readStoredPolicy` rejects with it and nothing is written.
- `POL-2: each write raises the sequence by one and records the mark after the policy`: given a
  trusted policy at 4, when writing, then sequence 5, the policy written before the mark, and the
  mark 5.
- `POL-2: a write after a rollback continues above the mark`: given a stored policy at 3 and the
  mark 5, when writing, then sequence 6.
- `POL-2, POL-3, YF3: a policy below the mark is damaged`: given a policy signed at sequence 3
  restored over one at 4, with the mark 4, then `damaged` with
  `policy-rollback: sequence 3 is below the highest seen (4)`.
- `POL-2: a policy above the mark raises it`: given the mark 2 and a policy at 3, then trusted and
  the mark 3.
- `POL-3, YF4: each kind of damage is reported, and the document is left in place`: for text that
  is not JSON, an envelope signed by another root, a v1 envelope, a payload out of bounds, and a mark
  of `'x'`, then `damaged` with its reason, and the stored bytes are unchanged.
- `POL-3, YF4: a damaged policy gives the strictest access values`: given a damaged policy whose
  configured defaults are 15 minutes and 14 days, then `accessPolicy()` is `STRICTEST_ACCESS`.
- `POL-3: a damaged policy governs nothing else`: then `governingPolicy()` is
  `{ ok: false, reason }`.

`signing/sequenceMark.server.test.ts` (unit), new: `REG-4, POL-2: each mark is its own secret`
(writing one leaves the other), and `REG-4, POL-2: a mark of another form names its own secret`.

Publication and sign-in (unit), in their existing test files:

- `POL-3: publishing refuses while the policy is damaged`: given `governingPolicy` answers
  `{ ok: false, reason: 'not JSON' }`, then `publishComponent` throws
  `security-policy/damaged: not JSON. An administrator must rewrite it on /configuration/security.`
  and compiles nothing.
- `POL-3: an access token issued while the policy is damaged lasts one minute`, and
  `POL-3: a session started while the policy is damaged lasts one day`.
- `POL-3: the current key does not rotate when due while the policy is damaged`: given a key past
  any interval, then `getCurrentSigningKey` returns it and nothing rotates.

`signing/keyResolution.server.test.ts` (unit), new, holds the rotation test above, since no test
file of `keyResolution.server.ts` existed.

`bootstrap.test.ts` (unit), in the root rotation's tests: `POL-4: root rotation writes the configured policy under the new root at the policy mark plus 1`:
given a bootstrapped instance, whose policy mark is 1, when the root rotates, then the policy is a
v2 envelope signed by the new root with the configured values and `sequence: 2`, and the mark is 2.
`creates the security policy document from the Tier-1 default` asserts the type
`genoacms.securityPolicy.v2`, where it asserted v1.

Existing tests whose doubles change, with no assertion changed:

- `securityPolicy/user.server.test.ts`: `readStoredPolicy` answers `{ state, policy | reason,
  version }`, `defaultPolicy` is mocked, and the `writePolicy` double is called with the policy and
  the version of the `stored` it is given, so its two `toHaveBeenCalledWith` assertions stand.
- The storage doubles of `auth/session.server.test.ts` and `bootstrap.test.ts` throw an error named
  `ObjectNotFoundError` for an absent object, since only a not-found creates the policy (POL-1).
- `testing/signingKeys.ts` gains `testPolicyReaders`, `accessPolicy` and `governingPolicy` over a
  trusted `testSecurityPolicy`, which the policy mocks of the other unit tests spread in place of
  `loadSecurityPolicy`; `testSecurityPolicy` itself stays without `sequence`, since
  `governingPolicy` answers a policy without one.

`packages/core/e2e/securityPolicy.test.ts` (e2e), new, in an instance of its own:

- `POL-3: a damaged policy keeps sign-in working and stops publishing until it is rewritten`: given
  the stored policy replaced with `{}`, when the administrator signs in, then sign-in succeeds; the
  security screen shows both POL-3 sentences with the reason; publishing a component shows
  `security-policy/damaged: …`. When the administrator saves the screen, then the notice is gone and
  publishing succeeds.
- `POL-2, POL-3: a restored older policy is damaged`: given a copy of the stored policy taken
  before the administrator saves it, put back after, then the security screen shows
  `policy-rollback: …`.

## Steps

1. Baseline: `pnpm --filter @genoacms/core test`, `node scripts/test-level.mjs e2e`,
   `node docs/tools/check-docs.mjs docs`; record the counts. RFC-0048 is implemented.
2. Tests: written from the Specification and this RFC, those that fail today marked `it.fails`, by a
   session that has not seen the implementation. Commit:
   `test(core): a sequenced security policy that fails closed (RFC-0049)`.
3. Code: the mark module, the policy, its readers, root rotation, the notice. Remove
   the markers and change no assertion. Commit with `commit-subject`.
4. Run §Verification. Update `signing.md` (POL-1 to POL-4 current, YF3, YF4 and YF8 *History.* and
   `fixed, RFC-0049`, `verified`), the Coverage row in `docs/README.md`, and
   `adapter-gcp/secrets.md`. Set this RFC to `auditing` with `commits`. Commit:
   `docs: RFC-0049's statements to current`.
5. **Stop for the author**, who deploys core, and migrates the stored policy with the author's own
   script or rewrites it on `/configuration/security`. Until then, the deployed instance reads its v1
   policy as damaged.
6. Audit POL-1 to POL-4 (WORKFLOW §6.3). Findings amend this RFC through steps 2 to 4; then
   `implemented` with `audit`.

## Verification

```bash
pnpm --filter @genoacms/core exec vitest run src/lib/script/securityPolicy src/lib/script/signing src/lib/script/auth src/lib/script/components/publication
# all pass, none marked it.fails
pnpm --filter @genoacms/core test
# all pass; the count is the baseline plus the new tests
node scripts/test-level.mjs e2e
# all pass, the two POL tests among them
node docs/tools/check-docs.mjs docs
# 0 error(s)
```

A falsification audit of POL-1 to POL-4, by an agent that did not write the code, recorded as a
Verification entry of `signing.md` and named in `audit`.

## Critique

**Pros**
- Closes the four ways of loosening the policy without a key: putting back an older one, damaging
  it, deleting it, and making its read fail.
- Fails closed without locking the administrator out: the values sign-in reads have strict bounds
  that are safe to run on, so the screen that repairs the policy stays reachable.
- The two marks share one module, so the manifest and the policy follow one rule for the format and
  the order of writes.
- A damaged policy is never rewritten by the instance, so the evidence stays for inspection.

**Cons & trade-offs**
- While damaged, users are signed out after a day and refresh every minute, nobody publishes, and
  keys stop rotating on schedule. An attacker who can write the storage can impose that, as they
  could already stop the instance by deleting its documents.
- A deployment of this core is damaged until its v1 policy is migrated or rewritten (Steps 5). Core
  could migrate a v1 policy that verifies by itself, but YD10 keeps it from rewriting trust
  documents.
- A process that first resolves a subject while damaged caches grants for 0 seconds until it
  restarts, even after the repair: a cost in reads, not in safety (RES-4 reads the value once).
- Skipping due rotation while damaged lets the current key outlive its interval for as long as the
  damage lasts; rotating on the strictest interval, a day, was the alternative.
- A second secret is written on every change of the policy.

**Blindspots & missed edge cases**
- Root rotation resets the policy to the configured defaults, as today, discarding the values an
  administrator set: the old root may be compromised, so nothing it signed is carried over. An
  operator rotating the root has to re-enter the policy.
- The marks of YF7's development server and of production differ, so a policy written from the
  development server raises only the local mark; production's catches up on its next read, and
  until then accepts a rollback to anything at or above its own mark.
- The configured defaults are offered on the screen as a starting point; an administrator who saves
  without reviewing them adopts them, which is YF4's loosening done by hand.
- A sign-in limit added to the policy later (RFC-0031) must decide its strictest value too; a limit
  of zero attempts would lock out the repair.
