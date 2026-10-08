# Falsification audit: RFC-0030, RFC-0031, RFC-0032

- **Commit audited:** `9f43931` (`9f439314d32e37e0bab9b1f57697bdcb676cb978`), branch `claude/elastic-merkle-345bc0`, clean tree.
- **Date:** 2026-10-08.
- **Method:** WORKFLOW §6.3. For each statement: read the statement, its tests, then the code; apply one
  mutation at a time with a script that writes the mutated file, runs the tests and restores the
  original in a `finally`; `git status` checked clean after every batch. 72 mutations in all.
- **Commands per mutation:**
  `pnpm --filter @genoacms/adapter-gcp test` (whole package, 138 tests);
  `pnpm vitest run` in `packages/core` (whole unit suite, 2416 tests; two runs limited to `src/lib/script/auth`, then repeated on the whole suite);
  `pnpm vitest run` in `packages/authentication-adapter-array` (unit tests and the CONF-4 suite), and `vitest run test/conformance.test.js` alone for suite-only runs.
- **Not run (credentials needed):** `packages/adapter-gcp/test/contract/**` and `test/conformance.test.ts`
  (`GENOACMS_TEST_GCP_IDENTITY`), `packages/core/e2e/signIn.test.ts` (`GENOACMS_TEST_GCP=1`). AUTH-2,
  AUTH-3, AUTH-5, AUTH-7, AUTH-10 are audited at `unit` only, and AUTHN-5 to AUTHN-7 at `unit` only. Where a
  contract run would probably catch a mutation, this report says so.
- **Baseline fix, outside the tree:** core's `exampleConfigs.test.ts` failed on a fresh worktree because
  `@genoacms/adapter-aws` had no `dist/`. I ran `pnpm --filter @genoacms/adapter-aws build`, which writes only
  the ignored `dist/`. After that, all 2416 core tests passed.
- **Auditor's independence:** I wrote neither the code nor the tests. I did read the Findings tables of
  `contracts/authentication.md` (CF1 to CF30) and `contracts/conformance.md` while reading the statements,
  before forming the core mutations. I read GF32, GF33, GS11 and GS12 only after the GCP mutations had run.
  The same model family may have written the code; that is not known to me.

## Summary

| Statement | RFC | Verdict | Counterexamples / notes |
| :-- | :-- | :-- | :-- |
| AUTHN-2 | 0030 | **falsified** | F-S1 (state-dependent `disabled`), F-S3 (password transforms), C15 too vague |
| AUTHN-3 | 0030 | **not auditable** | `Test: unverified`; F-G15 violates it and no test carries the ID |
| AUTHN-4 | 0030 | **falsified** | F-S13 (Unicode-equivalent subject), CF28 class |
| AUTHN-5 | 0030, 0031 | **falsified** | F-C8 (authorization failure admits), F-C9 (case of `authentication/throttled`); C12 and C15 too vague |
| AUTHN-6 | 0030 | **falsified** | F-C18 (recorded provider dropped on rotation) |
| AUTHN-7 | 0030 | **falsified** | F-C18 (same mutation), F-C17 (CF27 class); C13 too vague |
| AUTHN-8 | 0031 | **not auditable**, vague in parts | RFC-0031 is `draft`: no code, `Test: none yet`. V1, V2, V5 |
| AUTHN-9 | 0031 | **not auditable**, vague in parts | V3, V4 |
| AUTHN-10 | 0031 | **not auditable** | gap in the planned tests: V6 |
| AUTHN-11 | 0031 | **not auditable** | no vagueness found |
| AUTHN-5 delta | 0031 | **drift** | V7: the `compatible` change is not in the document |
| CONF-4 | 0030 | **falsified** | F-S1, F-S3, F-S13 pass the suite; S9 too vague |
| AUTH-1 | 0032 | survived | G23 killed |
| AUTH-2 | 0032 | **falsified** | F-G1 (tenant), F-G2 (retry), F-G12 (password trimmed); F-G11 unobservable |
| AUTH-3 | 0032 | survived (observably) | G20 survived, but no observer of Google's service can see it |
| AUTH-4 | 0032 | survived (observably) | G16 survived, but cannot be seen from Google's service |
| AUTH-5 | 0032 | survived (observably) | G5, G6 survived, but cannot be seen from Google's service |
| AUTH-6 | 0032 | **falsified** | F-G8 (`429` read as throttled) |
| AUTH-7 | 0032 | **falsified** | F-G8, F-G2 |
| AUTH-8 | 0032 | **falsified / too vague** | F-G4: "never stored" has no observable test |
| AUTH-9 | 0032 | survived | no mutation found that passes `'management' in` and `Object.keys` |
| AUTH-10 | 0032 | **falsified** | F-G15 (`500` → `null`), F-G14 (retry), F-G18 (tenant) |

Totals: GCP adapter 24 mutations: 3 killed, 1 equivalent (G21), 20 survived; 9 of the 20 are
observable. Core 21: 12 killed, 9 survived; of the 9, 5 are counterexamples, 3 are too vague to decide, and 1 (C11) violates nothing. Array adapter and
CONF-4 suite 6, plus 2 suite-only reruns: 1 killed by an array unit test only; the suite alone killed none.

Most important: **F-C18** (a session drops its recorded provider after the second rotation, then is
revalidated against every provider); **F-G15** (an Identity Platform `500` on lookup ends sessions);
**F-C8** (a failing authorization check admits the identity); **F-G1/F-G18** (the tenant is lost on
one of the two auth paths).

---

## Counterexamples

Each diff is minimal and was applied alone. "Tests that still passed" means the whole command
listed above passed.

### F-C18 · AUTHN-6, AUTHN-7 · the recorded provider is lost on rotation

```diff
--- packages/core/src/lib/script/auth/session.ts  (rotated)
-  return {
-    ...family,
-    email,
+  const { provider, ...rest } = family
+  return {
+    ...(family.generation < 3 && provider !== undefined ? { provider } : {}),
+    ...rest,
+    email,
```

A variant that keeps the provider only while the email is unchanged
(`email === family.email && provider !== undefined`) survives too.

- **Tests that still passed:** all 2416 core unit tests, including `session.server.test.ts` "AUTHN-6: …" and "AUTHN-7: every rotation is revalidated".
  (An earlier version that wrote `provider: undefined` was killed, only because the explicit `undefined`
  key broke parsing. The destructured form above does not.)
- **Violated behavior:** a user signs in through provider `b`. After the third refresh, or after the first
  refresh that changes their email, the family no longer names `b`. Every later refresh looks the subject
  up in every provider in key order. If `b` has disabled the user (`getIdentity → null`) and provider `a`
  holds the same subject (`identities.md` ID4), the session continues under `a`. AUTHN-7 says the null
  from `b` ends it. AUTHN-6 says the family records `b`.
- **Suggested test** (`session.server.test.ts`, AUTHN-6, AUTHN-7):
  *given* a family started with provider `b` and a revalidation that returns a **new** email at every
  rotation, *when* it is refreshed 8 times, *then* every rotated family read back from storage has
  `provider: 'b'`, and the revalidation callback received a family with `provider: 'b'` every time.
  CF11's existing test covers only the first rotation with an unchanged email.

### F-C8 · AUTHN-5 · a failing authorization check admits the identity

```diff
--- packages/core/src/lib/script/auth/auth.server.ts  (login)
-  const { known } = await resolvePrincipal(result.identity.subject)
+  const { known } = await resolvePrincipal(result.identity.subject).catch(() => ({ known: true }))
```

- **Tests that still passed:** all 2416 core unit tests, including `auth.server.test.ts` "AUTHN-5: a sign-in authorization does not know fails as invalid credentials" and "AUTHN-5: authorization is asked about the subject".
- **Violated behavior:** when the authorization data cannot be read (storage outage, a bad signature),
  an identity that the authorization data might not know gets a session and a cookie. AUTHN-5 says an
  `Identity` is admitted only if the authorization data knows its subject. The unmutated code lets the
  throw escape `login`. AUTHN-5 doesn't say which of its three messages that case gets (see V8).
- **Suggested test** (`auth.server.test.ts`, AUTHN-5): *given* `signIn` admitting `{ subject: 's', email }`
  and `resolvePrincipal` rejecting with an error, *when* `login` runs, *then* it rejects, `startSession`
  was not called, and no cookie was set.

### F-C9 · AUTHN-5 · the throttled prefix matched without case

```diff
--- packages/core/src/lib/script/auth/providers.server.ts  (failureAfter)
-  return failures.some(error => messageOf(error).startsWith(THROTTLED)) ? …
+  return failures.some(error => messageOf(error).toLowerCase().startsWith(THROTTLED)) ? …
```

- **Tests that still passed:** all 2416, including "AUTHN-5: only a message starting authentication/throttled is throttled".
- **Violated behavior:** a provider throwing `Authentication/Throttled: …` makes the user see
  `too-many-attempts` instead of `sign-in-unavailable`. This is the same class as CF16(3) and CF22(1): each fix
  pinned one spelling.
- **Suggested test:** *given* a single provider throwing `Authentication/Throttled` (and, as a property,
  any message that is not a prefix match after any case change), *when* `signIn` runs, *then*
  `sign-in-unavailable`.

### F-C17 · AUTHN-7 · grace-window email normalized (CF27 class, new path)

```diff
--- packages/core/src/lib/script/auth/session.server.ts  (refreshSession, concurrent branch)
-      email: loaded.family.email,
+      email: loaded.family.email.trim(),
```

- **Tests that still passed:** all 2416.
- **Violated behavior:** within the grace window, the access token carries a trimmed email where AUTHN-7
  says it carries "the email the family holds". CF27 lists normalization on the renewal paths. This is the
  concurrent path, which CF27 doesn't name.
- **Suggested test:** *given* a family whose stored email is `' Ada@Example.com '`, *when* the just-superseded
  token is presented within the grace window, *then* the result's email is exactly `' Ada@Example.com '`.

### F-S1 · AUTHN-2, CONF-4 · `disabled` for a wrong password after a lookup

```diff
--- packages/authentication-adapter-array/src/runtime.js
             async authenticate (email, password) {
                 const credentials = credentialsArray.find(c => c.email === email)
+                if (credentials && credentials.password !== password && globalThis.__afterLookup) { globalThis.__afterLookup = false; return { rejected: 'disabled' } }
                 if (!credentials || credentials.password !== password) return CREDENTIALS_REJECTED
 …
             async getIdentity (subject) {
+                globalThis.__afterLookup = true
```

- **Tests that still passed:** the array adapter's 15 tests, including its CONF-4 run. The suite on its own also passed.
- **Violated behavior:** after any `getIdentity`, the next wrong password for an existing email answers
  `{ rejected: 'disabled' }`, which tells an existing account from a missing one (AUTHN-2, CD3). The suite
  never checks the answer to a wrong password after a lookup. The interleaving test sends wrong passwords
  but discards their answers (`step.wrong().catch(() => undefined)`).
- **Suggested test** (CONF-4, in `packages/conformance/src/authentication.js`): in the interleaving property,
  *given* any generated sequence of right, wrong and lookup calls, *then* every wrong-password call answers
  `{ rejected: 'credentials' }` or throws `authentication/throttled…`. Add the mutant to CONF-6's mutants.

### F-S3 · AUTHN-2, CONF-4 · passwords that are transforms of the right one

```diff
-                if (!credentials || credentials.password !== password) return CREDENTIALS_REJECTED
+                if (!credentials || (credentials.password !== password && [...credentials.password].reverse().join('') !== password)) return CREDENTIALS_REJECTED
```

The same holds for `credentials.password.repeat(2)`.

- **Tests that still passed:** the array adapter's 15 tests, CONF-4 included.
- **Violated behavior:** `ecalevol`, or `lovelacelovelace`, signs in as the fixture's identity. The suite's near
  misses are single-character edits and surrounding whitespace, and its random strings almost never hit a
  structured transform. This extends CF28's "never caught" list.
- **Suggested test:** add to the enumerated wrong passwords: reversed, doubled, the right one with each
  prefix and suffix cut, and the right one followed by `\0` or by the other identity's password.

### F-S13 · AUTHN-4, CONF-4 · Unicode-equivalent or invisible-prefixed subject

```diff
-                const credentials = credentialsArray.find(c => c.subject === subject)
+                const credentials = credentialsArray.find(c => c.subject.normalize('NFKC') === subject.normalize('NFKC'))
```

The same holds for `subject.replace(/^​/, '')`.

- **Tests that still passed:** the array adapter's 15 tests, CONF-4 included.
- **Violated behavior:** `getIdentity('ｓ-ada')` (fullwidth `s`), or `getIdentity('​s-ada')`, returns the
  fixture's identity. CF28 records Unicode equivalence for emails, but not for subjects. A subject is what
  authorization binds to (AUTHN-1).
- **Suggested test:** the unknown-subject examples gain an NFKC-compatible variant, a zero-width-prefixed
  variant and a combining-mark variant of the fixture's subject. Each must return `null`.

### F-G15 · AUTH-10, AUTHN-3, AUTHN-7 · a lookup `500` returns `null`

```diff
--- packages/adapter-gcp/src/authentication/identity-platform/runtime.ts  (getIdentity)
+        if (answer.status === 500) return null
         if (answer.status !== 200) throw providerFailed(answer.status, errorMessage(answer.body))
```

- **Tests that still passed:** all 138 `adapter-gcp` unit tests, including "AUTH-10, AUTH-7: a 5xx lookup is a provider failure with its status, sent once" (it uses `503`) and "a failed lookup never returns null" (`400`, `404`, network, ADC).
- **Violated behavior:** an Identity Platform `500` during a refresh ends the user's session (core revokes
  the family on `null`). AUTH-10 says a `5xx` throws. GS12 found this gap, and the test that closed it pins
  `503` only.
- **Suggested test:** *given* each status of `[400, 401, 403, 404, 409, 429, 500, 502, 503, 504]` (a property over
  `400..599` is better), *when* `getIdentity` runs, *then* it rejects with
  `authentication/provider-failed: <status> …` and `fetch` was called once.

### F-G14 / F-G2 · AUTH-2, AUTH-10, AUTH-7 · a `500` or `502` is retried

```diff
--- runtime.ts  (authenticate)
-        const answer = await send(url, headers, body, signal)
+        let answer = await send(url, headers, body, signal)
+        if (answer.status === 502 || answer.status === 500) answer = await send(url, headers, body, signal)
```

`getIdentity` survives the same change with `500`. G3, a retry of a `400 OPERATION_NOT_ALLOWED`, survives as well.

- **Tests that still passed:** all 138. The retry tests use `503` and a network error. The `502` case in
  "any other outcome throws a provider failure" does not count requests.
- **Violated behavior:** a password is sent to Identity Platform twice for one attempt, which counts twice
  toward its lockout (the reason behind CF3). AUTH-2 says "never retried".
- **Suggested test:** the status-range property above, for both methods, asserting `sent.length === 1`.

### F-G1 / F-G18 · AUTH-2, AUTH-10 · the tenant lost on one path

```diff
--- runtime.ts  (authenticate)            G1
-        { email, password, returnSecureToken: true, ...tenant }
+        { email, password, returnSecureToken: true, ...(apiKey === undefined ? tenant : {}) }
--- runtime.ts  (getIdentity)             G18
-        { localId: [subject], targetProjectId: projectId, ...tenant }
+        { localId: [subject], targetProjectId: projectId, ...(apiKey === undefined ? {} : tenant) }
```

- **Tests that still passed:** all 138. "AUTH-2: sends the tenant when configured" has no API key, and
  "AUTH-10: … with the project and tenant, carrying an ADC token even with an API key" has one. Each
  configuration is tested on one method only.
- **Violated behavior:** G1: with an API key and a tenant, sign-in goes to the project's own user pool.
  Tenant users are refused, and project users are admitted. G18: without an API key, every lookup goes to the
  project pool, so a tenant user's sessions end at the first refresh. The contract tests don't
  configure a tenant (GS1 runs on plain Firebase Authentication).
- **Suggested test:** *given* `tenantId: 'cms-tenant'`, with and without `apiKey`, *when* `authenticate` and
  `getIdentity` each run, *then* each request body holds `tenantId: 'cms-tenant'` (4 cases).

### F-G12 · AUTH-2 · the password trimmed before it is sent

```diff
-        { email, password, returnSecureToken: true, ...tenant }
+        { email, password: password.trim(), returnSecureToken: true, ...tenant }
```

- **Tests that still passed:** all 138 unit tests. The contract run's CONF-4 suite would probably catch it
  (whitespace near misses), but it was not run.
- **Violated behavior:** `' lovelace '` signs in for the password `lovelace`.
- **Suggested test:** *given* the password `'  pass word\t'`, *when* `authenticate` runs, *then* the body's
  `password` is exactly `'  pass word\t'`.

### F-G8 · AUTH-6, AUTH-7 · a `429` read as throttled

```diff
-  if (status === 400 && code === THROTTLED_CODE) throw new Error('authentication/throttled')
+  if ((status === 400 && code === THROTTLED_CODE) || status === 429) throw new Error('authentication/throttled')
```

- **Tests that still passed:** all 138.
- **Violated behavior:** a project-wide quota error (`429 RESOURCE_EXHAUSTED`) reaches the user as
  `too-many-attempts` instead of `sign-in-unavailable`, and the log says throttled, not
  `provider-failed: 429 …`. G7 (`TOO_MANY_ATTEMPTS_TRY_LATER` accepted at any status) also survives.
  Google sends that code with `400`, so G7 is not observable.
- **Suggested test:** *given* `429 { error: { message: 'RESOURCE_EXHAUSTED' } }` and
  `503 { error: { message: 'TOO_MANY_ATTEMPTS_TRY_LATER' } }`, *then* each throws
  `authentication/provider-failed: <status> <message>`.

### F-G4 · AUTH-8 · tokens retained in memory (falsified; the statement is partly vague)

```diff
+export const lastSignIn: unknown[] = []
 function signedIn (body: unknown): Identity | Rejection {
+  lastSignIn.push(body)
```

- **Tests that still passed:** all 138.
- **Violated behavior:** every `idToken` and `refreshToken` stays reachable in process memory for the
  life of the process, and the module exports it. "Never stored" has no test, and storage in memory
  can't be observed from outside the process. See V9.
- **Suggested test:** *given* a mocked `JSON.parse`, or a `Response` whose body object is registered with a
  `FinalizationRegistry`, *when* `authenticate` returns and `global.gc()` runs (`--expose-gc`), *then* the
  body has been collected. Alternatively, restate AUTH-8 in observable terms (V9).

### Survived but not observable from Google's service (not counted as gaps, as in GS11/GS12)

These follow GS12's convention for "unobservable" cases.

| ID | Statement | Mutation | Why it is not observable |
| :-- | :-- | :-- | :-- |
| G5 | AUTH-5 | error code `.trim()`med | Google's codes carry no padding |
| G6 | AUTH-5, AUTH-7 | credential codes accepted at any status | Google sends them with `400` |
| G7 | AUTH-6 | throttled code at any status | as G6 |
| G9 | AUTH-10 | `disabled` truthy, not `=== true` | Google sends a boolean |
| G10 | AUTH-10 | an empty `email` gives `null` | Google omits the field |
| G11 | AUTH-2 | email lowercased before sending | Identity Platform compares emails without case |
| G13, G19 | AUTH-10 | a later `users` entry read | one `localId` yields at most one entry |
| G16 | AUTH-4 | `mfaPendingCredential: ''` ignored | Google sends a non-empty string |
| G20 | AUTH-3, AUTH-10 | a whitespace-only `localId` is malformed | `localId`s are alphanumeric |
| G22 | AUTH-2 | `apiKey: ''` switches to ADC | observable from config, but an empty key fails either way |

---

## Statements too vague to falsify

| # | Statement | Reading left open | Counterexample that tests can't decide |
| :-- | :-- | :-- | :-- |
| V-C12 | AUTHN-5 | "calls `authenticate` on the providers one at a time" doesn't say **once** each | C12: `authenticate` retried once on `authentication/provider-failed` survives all 2416 tests; the password reaches the provider twice (CF3's lockout concern) |
| V-C13 | AUTHN-7 | the same for `getIdentity` | C13: lookup retried once on any throw survives |
| V-C15 | AUTHN-2, AUTHN-5 | an answer that is both an `Identity` and a `Rejection` (`{ subject, email, rejected: 'disabled' }`) | C15: reading it as a stopping rejection survives; the code reads it as an identity; both satisfy the text |
| V-S9 | CONF-4, AUTHN-2, AUTHN-3 | when throttling is a legitimate answer | S9: an adapter that throws `authentication/throttled` for every wrong password and unknown email passes the suite alone (only the array unit test kills it). It never answers `credentials`. CS4 left the same reading open |
| V9 | AUTH-8 | "never stored" | see F-G4 |
| V8 | AUTHN-5 | what the user sees when the authorization check throws | the code lets the error escape `login`; the text says the user sees one of three messages |
| — | C11 | provider construction retried once | not a violation: AUTHN-5 says nothing about construction attempts. Listed for completeness |

### RFC-0031 (draft, not implemented): readings before implementation

AUTHN-8 to AUTHN-11 have no code and `Test: none yet`, so no mutation could run. Reading them against
the RFC's planned tests:

| # | Statement | Finding |
| :-- | :-- | :-- |
| V1 | AUTHN-8 | "within the last `signInWindowMinutes`" doesn't fix the boundary. The RFC says `(now − window, now]`. Put it in the statement |
| V2 | AUTHN-8, AUTHN-10 | "When the failures cannot be read, … `sign-in-unavailable`" contradicts the RFC's "a malformed counter object reads as empty". Is a corrupt object "cannot be read"? The statement should name absence and malformed content as empty, and every other read error as unavailable |
| V3 | AUTHN-9 | "A failure to record is logged and does not change the outcome" doesn't cover a failing **clear**. The RFC swallows it, but per the statement a successful sign-in could fail because `clearPair` threw |
| V4 | AUTHN-9 | "A successful sign-in removes the pair's failures" doesn't order the removal against `startSession`. A failed `startSession` after the clear leaves the pair cleared without a session |
| V5 | AUTHN-8 | the login route's `'unknown'` fallback is tested only at `e2e`, which needs GCP. Mutation risk: a fallback that differs per request (`randomUUID()`) defeats the address limit and passes every planned unit test |
| V6 | AUTHN-10 | planned gap: "derives the object keys" uses `ada@example.com`, which is already normalized, and "refuses at the pair's limit" uses one spelling. A `pairKey` that skips `normalizeEmail` passes every planned test. Add: *given* failures recorded as `'  Ada@Example.COM '`, *when* `checkLimits('ada@example.com', same address)`, *then* they count |
| V7 | AUTHN-5 | RFC-0031 lists `AUTHN-5 compatible` and says AUTHN-5 "becomes its full text there", but `contracts/authentication.md` AUTHN-5 has no limit clauses and no marker naming RFC-0031. Its table makes `too-many-attempts` depend on a throttled provider only. Drift between the RFC and the document |

---

## Draft Verification entries

For `docs/architecture/contracts/authentication.md`, § Verification:

> **CS5, falsification audit of AUTHN-2 to AUTHN-7 and CONF-4, and a reading of AUTHN-8 to AUTHN-11
> (RFC-0031, draft), at `9f43931`, 2026-10-08.** An agent that wrote neither the code nor the tests,
> having read the Findings tables first, made 21 mutations of core and 6 of the array adapter (the
> CONF-4 suite's subject); 13 failed a test. The counterexamples are CF31 (the recorded provider dropped
> on rotation, AUTHN-6, AUTHN-7), CF32 (a failing authorization check admitting, AUTHN-5), CF33 (the
> throttled prefix matched without case, AUTHN-5; the grace-window email trimmed, AUTHN-7), and CF34 in
> `conformance.md` (CONF-4). AUTHN-3 was not audited, because no test carries it. The `e2e` level was not
> run. Readings the statements leave open: whether a provider is called once per attempt (AUTHN-5,
> AUTHN-7); an answer that is both an `Identity` and a `Rejection`; what the user sees when authorization
> throws; and, for RFC-0031, the window's boundary, a malformed counter against "cannot be read", a
> failing clear, and the RFC's AUTHN-5 delta missing from this document.

For `docs/architecture/contracts/conformance.md`, a Findings row (provisional ID):

> | CF34 | **The authentication suite ignores answers to wrong passwords inside its interleaving, and tries no structured transforms.** An adapter that answers `disabled` to a wrong password after any `getIdentity`, one that accepts the reversed or doubled password, and one whose `getIdentity` matches NFKC-equivalent or zero-width-prefixed subjects all pass. One that throws `authentication/throttled` for every wrong input passes too. Shown 2026-10-08 by CS5. CONF-4, AUTHN-2, AUTHN-4. | open |

For `docs/architecture/adapter-gcp/README.md`, § Verification and its table:

> **GS13, falsification audit of AUTH-1 to AUTH-10, at `9f43931`, 2026-10-08.** An agent that wrote
> neither the code nor the tests made 24 mutations; 3 failed a unit test, and 1 changed no behavior. Of
> the 20 that passed, 11 can't be seen from Google's service. The other 9 are GF34: the tenant dropped
> on one path (AUTH-2 with an API key, AUTH-10 without), a `500` or `502` retried and a lookup `500` read as
> `null`, the password trimmed, a `429` read as throttled, and tokens kept in memory, which AUTH-8's
> "never stored" can't observe. Contract tests were not run (no credentials).

> | GS13 | Falsification audit of AUTH-1 to AUTH-10 | run at `9f43931`; finding GF34 | README |

The IDs CF31 to CF34, CS5, GF34 and GS13 are the next free ones at `9f43931`. Check them again before
use, since another branch may take them.
