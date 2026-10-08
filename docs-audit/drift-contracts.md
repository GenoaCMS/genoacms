# Drift audit: service contracts

Audit of `docs/architecture/contracts/` (`README.md`, `adapter-model.md`, `authentication.md`,
`conformance.md`) against `packages/contracts`, `packages/conformance` and
`packages/authentication-adapter-array`, at `9f43931` (branch `claude/modest-fermat-e12221`),
2026-10-08. Read-only: nothing was edited or committed. Under WORKFLOW §6.3, each mismatch is a
finding for the author. This report does not decide which side is wrong.

## Scope and method

- **Statements in scope, current:** AUTHN-1 to AUTHN-7, CONF-1, CONF-4. AUTHN-8 to AUTHN-11 and
  CONF-2, CONF-3, CONF-5 and CONF-6 are **New**. I compared them with the code only where the code
  already does part of what they describe.
- **Core's statements (AUTHN-5 to AUTHN-7)** describe `packages/core`, which is outside the code
  scope. I checked only their test references (through `check-docs.mjs`), and the places where the
  three audited packages feed into core's behavior (D2). Core's own code was not re-audited against
  them, and CF27 (open, core) was not re-checked.
- `adapter-model.md` has `conforms: false` and no statements. I compared its normative-looking
  type blocks and its package diagram with the code, and report the differences as editorial.

Commands run:

| Command | Result |
| :-- | :-- |
| `node docs/tools/check-docs.mjs docs` | 0 errors, 5 warnings (all `conforms: false`, one of them `adapter-model.md`) |
| `pnpm --filter ./packages/contracts test` | 4 files, 32 tests passed |
| `pnpm --filter ./packages/contracts run check` (tsc type tests) | passed |
| `pnpm --filter ./packages/authentication-adapter-array test` | 15 passed, 3 skipped (the suite's `disabled` tests: no `disabled` fixture) |
| `pnpm --filter ./packages/conformance test`, 4 runs | 3 runs passed (33 to 51 s). **1 run exited 1**: 21/21 tests passed, `Errors 1 error`, an unhandled error from a vitest timer (`Timeout._onTimeout … vitest/dist/chunks/index.B521nVV-.js:59`), duration 146.7 s (D9) |
| `vitest run --exclude 'test/**' --exclude 'e2e/**' --passWithNoTests` in `packages/contracts` (the CI unit run's arguments) | `No test files found, exiting with code 0` (D4) |

## Findings

### D1 · CONF-4 · The suite refuses a throttled answer from `getIdentity`, which the statement accepts

- **Doc:** `docs/architecture/contracts/conformance.md:176-178`: "For a wrong password or an unknown
  email, and anywhere in a property, an error whose message starts with `authentication/throttled`
  is also an accepted answer".
- **Code:** `packages/conformance/src/authentication.js:222-231`. The test `AUTHN-4: getIdentity
  returns null for an unknown subject` runs a property (`fc.assert(fc.asyncProperty(…))`, line 227)
  with `expect(await adapter.getIdentity(subject)).toBeNull()`, and does not use
  `answersOrThrottles`.
- **Mismatch, as behavior:** if an adapter's `getIdentity` throws `authentication/throttled: …` for
  one of the property's generated subjects, the suite fails it. CONF-4 says such an adapter passes.
  This applies to Identity Platform, whose `accounts:lookup` is rate-limited and which runs the suite
  in contract runs (`runs: 5`). The other properties do accept a throttled answer: lines 183-185 and
  202-206 through `answersOrThrottles`, and line 264 in the sequence property.
- **Severity:** behavior (of the suite, which is published API).
- **Options:** (a) fix the suite: accept the throttled error in the `getIdentity` property, and in
  the examples too if wanted, with a mutant that throttles there and is expected to pass; (b) fix the
  spec: limit the allowance to `authenticate` ("for a wrong password or an unknown email, and in a
  property over `authenticate`").

### D2 · AUTHN-3 (and AUTHN-5's logging rule) · The array adapter's construction errors have no `authentication/` prefix, and one carries emails from the credentials

- **Doc:** `authentication.md:230-235` (AUTHN-3): an adapter that "is misconfigured, throws an `Error`
  whose message starts with `authentication/`". `authentication.md:267-270` (AUTHN-5): "a provider
  that cannot be constructed is a failure … No line core writes during a sign-in … contains the email
  or the password."
- **Code:** `packages/authentication-adapter-array/src/runtime.js:38` throws `missing-credentials`.
  `runtime.js:11-16` throws `missing-subject: <email>, <email>`, built from the resolved credentials
  secret. Construction is lazy, retried, and not wrapped:
  `packages/config/src/host/index.ts:101,104-110` rethrows `runtime.create`'s error unchanged. Core
  logs it during the sign-in: `packages/core/src/lib/script/auth/providers.server.ts:37-45,50`
  (`provider <key> failed: <message>`).
- **Mismatch, as behavior:** (1) A misconfigured array provider fails with a message that does not
  start with `authentication/`. Whether AUTHN-3 covers construction, or only `authenticate` and
  `getIdentity`, is not stated. (2) A user who types the email of an entry without a `subject` makes
  core write `… failed: missing-subject: <that email>` on every sign-in attempt. That is the typed
  email in a log line, which AUTHN-5 forbids. The message also exposes part of a resolved secret,
  which the host's own `HostError` rule ("Never a resolved value", `config/src/host/errors.ts:4`)
  avoids. I found this by reading the code and did not execute it. CS4 already left open "whether a
  provider's own thrown message, which core logs, may contain the email".
- **Severity:** behavior.
- **Options:** (a) fix the code: prefix the construction errors (`authentication/missing-subject`)
  and name entries by index instead of email; (b) fix the spec: state that AUTHN-3 covers only the two
  methods, and that construction errors are free-form, and narrow AUTHN-5's logging rule to the lines
  core composes, leaving a provider's own messages out; (c) both: have core or the host redact
  provider messages, with a statement saying so.

### D3 · AUTHN-4 · The array adapter's `getIdentity` finds entries that cannot sign in

- **Doc:** `authentication.md:242-243`: "returns the `Identity` of a subject that exists **and could
  sign in now** … `null` for a subject that is unknown, deleted or disabled."
- **Code:** `runtime.js:53-56` returns any entry whose `subject` matches. `create` checks only that
  every entry has a truthy `subject` (`runtime.js:12`). An entry with no `password`, or a non-string
  `password` (JSON `123`, `null`), can never authenticate (`runtime.js:47` compares with `!==`), yet
  `getIdentity` returns its `Identity`.
- **Mismatch, as behavior:** an operator who removes an entry's password to stop a user signing in
  leaves that user's open sessions alive: AUTHN-7's revalidation gets an `Identity`, not `null`.
  Removing the whole entry does revoke them.
- **Severity:** behavior (an edge case of the config).
- **Options:** (a) fix the code: refuse at `create` an entry without a string password, or answer
  `null` for one; (b) fix the spec: weaken "could sign in now" for adapters with no notion of
  disabling, or specify the array adapter (it "has no document yet", `authentication.md:29-30`).

### D4 · AUTHN-2 · A named unit test file never runs in CI, and neither do `@genoacms/contracts`' other tests or its type tests

- **Doc:** `authentication.md:227-228` names `packages/contracts/test/authentication.test.js` at
  `unit`. `adapter-model.md:115`: "Checked with `tsc --strict`, including the negative cases marked
  `must not compile`." `docs/README.md:61` defines `unit` as "a package's vitest tests in `src/`".
- **Code:** `scripts/test-level.mjs:13,33-40` runs the unit level with `--exclude test/**`.
  `packages/contracts/vitest.config.js:6` includes only `test/*.test.js`, so the CI unit run finds no
  file (reproduced above). No other level lists `packages/contracts`. The `check` script (tsc over
  `test/types/contracts.test.ts`) is not a step of `.github/workflows/ci.yml`.
- **Mismatch, as behavior:** the `AUTHN-2` test in `packages/contracts/test/authentication.test.js`,
  `define*`'s tests, the secret-key tests, the `PreconditionFailedError` tests and every type-level
  test (bootstrap rule, `Resolved`, registry, the `AuthenticationAdapter` shape) can regress without
  CI noticing. AUTHN-2 still passes `check-results` only through
  `packages/authentication-adapter-array/src/runtime.test.js`.
- **Severity:** test gap.
- **Options:** (a) fix the code or CI: move the tests to `src/`, or add `packages/contracts` to a
  level, and add the `check` scripts to CI; (b) fix the spec: drop the file from AUTHN-2's `- Test:`,
  and record in `adapter-model.md` that the type checks are local only.

### D5 · AUTHN-2 · The test in `@genoacms/contracts` checks an unspecified helper, which accepts any `rejected` value

- **Doc:** `authentication.md:207-225` specifies `Rejection` as `{ rejected: RejectionReason }` with
  three reasons. No statement mentions `isRejection`.
- **Code:** `packages/contracts/src/authentication/index.js:7-9` exports `isRejection`, which is true
  for any object with a `rejected` key: `isRejection({ rejected: 'bogus' })` and
  `isRejection({ rejected: undefined })` are `true`. Core does not rely on it alone; it adds a reason
  check (`core/…/providers.server.ts:20-24`, which fixed CF26). The test
  `packages/contracts/test/authentication.test.js:5` (`AUTHN-2: isRejection tells a rejection from an
  identity`) checks only one valid rejection and one identity.
- **Mismatch, as behavior:** an exported, published function has no statement. The only test that
  carries AUTHN-2 in this package checks that helper, not `authenticate`'s contract. A third-party
  consumer that trusts `isRejection` to recognize a valid `Rejection` would bring CF26 back.
- **Severity:** test gap / unspecified behavior.
- **Options:** (a) fix the code: make `isRejection` check the reason (core's `isValidRejection`), and
  test the malformed cases; (b) fix the spec: add a statement for `isRejection` as it is ("has a
  `rejected` key") and retitle the test with it, or remove the export.

### D6 · AUTHN-2 · `second-factor-required` "only when the password is known to be right" is checked by no named test

- **Doc:** `authentication.md:224-225`.
- **Code/tests:** none of the three files AUTHN-2 names sends a wrong password to an identity that
  requires a second factor. The suite's fixture has no such identity
  (`conformance/src/authentication.js:168`), and the array adapter cannot produce the reason.
  `disabled` is covered (`authentication.js:214-216`).
- **Mismatch:** an adapter that answers `second-factor-required` before checking the password passes
  every named test. That lets someone guessing passwords tell an enrolled account from a missing one,
  which CD3 rules out.
- **Severity:** test gap.
- **Options:** (a) add an optional `secondFactor` fixture identity to CONF-4, mirroring `disabled`,
  with its mutant; (b) record the clause as unverified on AUTHN-2 (`- Test: … (unverified:
  second-factor-required)`), or point to an adapter's own test if `adapter-gcp` has one.

### D7 · CONF-4 · The suite requires the same answer on every call, where the statement allows either reason each time

- **Doc:** `conformance.md:171-174`: the disabled identity's correct password returns `{ rejected:
  'disabled' }` **or** `{ rejected: 'credentials' }`, and "the answers … are the ones above, every
  time."
- **Code:** `conformance/src/authentication.js:267-269` checks that every answer is in `right`, and
  also that it equals the first answer seen for that key in the sequence.
- **Mismatch, as behavior:** an adapter whose disabled identity is answered `disabled` once and
  `credentials` later passes CONF-4 as written, but fails the suite. Today only the stability of the
  `disabled` and `credentials` alternatives is affected; every other key has exactly one right answer.
- **Severity:** behavior (low), or editorial if "the ones above, every time" was meant to say "the
  same each time".
- **Options:** (a) fix the suite: drop the `first`-answer comparison where `right` has two members;
  (b) fix the spec: say that each answer is also the same every time.

### D8 · CONF-4 / CONF-6 / CF8 · The mutant test exists for the authentication suite, but is titled CONF-4, whose text does not state it, and CF8 and the Verification section do not mention it

- **Doc:** CONF-4 (`conformance.md:143-184`) says nothing about mutants. CONF-6
  (`conformance.md:207-214`) states the mutant rule and is `new (no RFC yet)`, `Test: none yet`. CF8
  (`conformance.md:64`) says "Nothing checks that a suite fails a non-conforming adapter. The
  package's tests run each suite only against in-memory adapters that conform". The Verification
  section (`conformance.md:81-83`) names only `storage.test.js` and `database.test.js`, "Their titles
  carry no IDs yet."
- **Code:** `packages/conformance/test/authentication.test.js:28-32`, `CONF-4: each assertion fails
  against its mutant`, runs 20 mutants (`test/mutants/authentication.js:10-106`) in child Vitest runs
  and expects exactly the listed tests to fail. RFC-0030 planned this under CONF-4
  (`docs/rfcs/0030-authentication-contract.md:290,319`), which also deferred CONF-6.
- **Mismatch:** the assertion of a test carrying CONF-4 is not part of CONF-4's text. CONF-6 is
  already implemented for one of its suites. CF8's wording and the Verification section are stale for
  the authentication suite, though still accurate for storage and database.
- **Severity:** editorial.
- **Options:** (a) spec: add the mutant clause to CONF-4, or split CONF-6 so that the authentication
  suite's part is current, and update CF8 ("storage and database suites only") and the Verification
  section; (b) code: retitle the test with CONF-6, once CONF-6 may be referenced while new.

### D9 · CONF-4 (CD5) · The mutant test can fail the package's run with an unhandled vitest timeout

- **Doc:** CD5 (`conformance.md:43-49`) and CONF-4's test reference.
- **Code:** `packages/conformance/test/authentication.test.js:12-25` runs 20 child Vitest runs with
  `spawnSync`, which blocks the worker's event loop for the whole test (32 to 147 s here).
- **Observed:** 1 of 4 runs exited 1 with all 21 tests passing and one unhandled error raised from a
  vitest timer, after 146.7 s. CI's last step (`ci.yml`, "Fail when a test run failed, also outside
  its JUnit report") fails the job on that. `docs/README.md:70` records the same symptom for
  `@genoacms/sdk` (`Timeout calling "onTaskUpdate"`). I did not capture the full message, so its
  cause, the worker's RPC timing out while blocked, is likely but not confirmed.
- **Severity:** test gap (reliability of the evidence for CONF-4).
- **Options:** (a) code: run the children with async `spawn` and await them, or run them in parallel;
  (b) docs: record it as a known gap in `docs/README.md` beside the `@genoacms/sdk` entry.

### D10 · (no statement) · Unspecified observable behavior in the three packages

None of these is wrong against a statement, but each is observable and no statement or Design entry
covers it (WORKFLOW principle 2):

| # | Behavior | Where |
| :-- | :-- | :-- |
| a | `define*` freezes the descriptor and overwrites a `kind` given in the input; `defineRuntime` and `defineDeployProcedure` are exported identity functions | `contracts/src/index.js:9,22-23`, tested in `contracts/test/define.test.js` without IDs. `adapter-model.md:232-233` names neither the freeze nor the two helpers |
| b | `PreconditionFailedError`'s message `storage/precondition-failed: <bucket>/<name>: <reason>`, `isPreconditionFailed` matching by `name`; `isValidSecretKey`/`assertValidSecretKey` and `invalid-secret-key:` | `contracts/src/storage`, `contracts/src/secrets`. The README marks storage and secrets "not specified yet", so this is expected |
| c | Array adapter: `create` throws `missing-credentials` for a non-array, and `missing-subject: <emails>` for entries with a falsy `subject` (a non-string truthy subject such as `1` is accepted, and core then treats its `Identity` as invalid, AUTHN-5) | `runtime.js:12,38` |
| d | Array adapter: duplicate emails or subjects are not refused, and the first entry wins. With two entries sharing a subject, `authenticate` through the second returns its email, while `getIdentity` returns the first's, so AUTHN-7's renewed token switches email at the first refresh | `runtime.js:46,54` |
| e | Array adapter: emails match exactly, case included (AUTHN-2 leaves case to the adapter, but it is not recorded anywhere for this adapter) | `runtime.js:46` |
| f | Array descriptor: `validate` refuses any option other than `credentials` (`unknown option '<key>'`) and requires `credentials` | `descriptor.js:7-12` |
| g | Conformance: the suite requires an exact `Identity` (`toEqual`), so an adapter returning extra fields fails. CS4 recorded this as an open reading | `conformance/src/authentication.js:189,219` |
| h | Conformance: `fast-check` is a runtime dependency of the published package | `conformance/package.json:30` |

- **Severity:** editorial / unspecified behavior.
- **Options per row:** add statements (an array-adapter document, a `define*` statement in the
  adapter model once it is restructured), or declare the behavior internal and free to change.

### D11 · adapter-model.md (no statements, `conforms: false`) · Text and types that differ from `@genoacms/contracts`

| # | Doc | Code | Difference |
| :-- | :-- | :-- | :-- |
| a | `adapter-model.md:70`: `@genoacms/conformance  storage & database suites` | `conformance/src/index.js:3` also exports `runAuthenticationConformance` | stale diagram |
| b | `adapter-model.md:52`: `@genoacms/contracts (no runtime deps)`; `:82` says it depends on `@genoacms/internal` | `contracts/package.json:49-51`: `dependencies: { "@genoacms/internal" }`, used only for a type (`index.d.ts:7`) | the doc contradicts itself |
| c | `adapter-model.md:209`: `svelteKitAdapter` returns `{ default: (options?) => import('@sveltejs/kit').Adapter }` | `contracts/src/adapter.d.ts:35,44`: a structural `SvelteKitAdapterFactory` (`adapt: (builder: never) => unknown`), an exported type the doc does not name | the type differs; the code's form avoids a dependency on `@sveltejs/kit` |
| d | `adapter-model.md:184`: `AdapterContext.name` "Used in log lines only"; `:186` `resources` | `adapter.d.ts:17`: "For log lines and error messages"; `:19` adds "otherwise empty" | contracts' doc comments promise more than the document |
| e | `adapter-model.md:221-224`: `DeployContext.workDir` "owned by this deploy"; `target` undocumented | `adapter.d.ts:56,58`: `workDir` "exists and is empty when the procedure starts"; `target` "The target's key in `deployment.targets`" | same |
| f | `adapter-model.md:115`: the type blocks are "Checked with `tsc --strict`" | see D4: the check exists but CI does not run it | an unenforced claim |
| g | `packages/conformance/README.md:1-12` (package README, not an architecture document): "storage and database adapter", two functions | three suites | stale published README |

- **Severity:** editorial.
- **Options:** update `adapter-model.md` when it is restructured, or now as an editorial change. Or
  align the code's doc comments with the document.

## Existing findings re-checked

| Finding | Recorded state | Still accurate? |
| :-- | :-- | :-- |
| CF1 | open, fixed by CD7 | Yes. CD7 and AUTHN-8 to AUTHN-11 are `new (RFC-0031)`, RFC-0031 is `draft`, and no code in `packages/` mentions `signInFailures` or `.genoacms/security/sign-in`. |
| CF2 | open | Yes. `runtime.js:47`: `credentials.password !== password`, plain text, not constant time. |
| CF3 | mitigated, RFC-0030 | Yes. Core tries providers one at a time and stops at the first identity or stopping rejection (`core/…/providers.server.ts:69-75`). The row's text still describes the old `callProvidersFunction`, as a finding's history. |
| CF4, CF5, CF10 to CF13, CF16 to CF19, CF21, CF22, CF24 | fixed, RFC-0030 | Core; not re-audited (outside the code scope). The tests their fixes rely on exist and carry their IDs (`check-docs`: 0 errors). |
| CF14 | fixed | Yes. `runtime.test.js:33-36` (`AUTHN-4: an email is not a subject`), and the suite asks for both emails (`conformance/src/authentication.js:223`), with mutant `getIdentity answers the fixture's email`. |
| CF25, CF26 | fixed | Yes, as seen from the contract's side: core's `isIdentity` and `isValidRejection` (`providers.server.ts:22-30,39-41`). Note D5: the exported `isRejection` alone would still accept a malformed rejection. |
| CF27 | open | Not re-checked (core). |
| CF30 | open | Yes. The contract is still one step (`contracts/src/authentication/adapter.d.ts:5`). |
| CF6 | fixed, `f22136c` | Yes. `conformance/src/storage.js:42-44` awaits the stream with `for await`. Its own note "no test yet shows that the check fails a wrong body" is still true. |
| CF7 | open | Yes. `conformance/src/database.js:111` reassigns `documentData` during collection, so every step uses `testDocuments[1]`. `lists collection` (`:148-156`) checks only `toBeInstanceOf(Array)`, and runs after the delete. |
| CF8 | open (CD5) | **Partly stale** (D8): the authentication suite now has mutant tests. Still true for storage and database. |
| CF9 | open (CD6) | Yes. `storage.js:16-17` uses `GenoaCMS/test.txt`, with no cleanup outside the delete step. `adapter-aws/test/conformance.test.ts:48` wraps under a prefix; `adapter-gcp/test/conformance.test.ts:11` does not. |
| CF15, CF20, CF23 | fixed, RFC-0030 | Yes. The email is checked by `toEqual` (`:189,219`); the disabled identity's wrong passwords (`:214-216`); near misses, generated inputs and sequences (`:111-139,183-185,237-272`). Each has a mutant. |
| CF28 | open | Yes. The enumerated near misses insert only `x`, replace by code point XOR 1, at three positions (`:111-120`). Nothing tries `+tag`, `#suffix`, dots or Unicode equivalence. |
| CF29 | fixed, RFC-0030 | Yes. `TEST_TIMEOUT = 120_000` on every test (`:91`). |

The README's Register (`README.md:59-107`) matches the states in the two documents' tables.

## Summary

| # | Statement | Doc | Code | Severity |
| :-- | :-- | :-- | :-- | :-- |
| D1 | CONF-4 | `conformance.md:176-178` | `conformance/src/authentication.js:222-231` | behavior |
| D2 | AUTHN-3, AUTHN-5 | `authentication.md:230-235,267-270` | `authentication-adapter-array/src/runtime.js:11-16,38`; `config/src/host/index.ts:101` | behavior |
| D3 | AUTHN-4 | `authentication.md:242-243` | `authentication-adapter-array/src/runtime.js:12,47,53-56` | behavior |
| D4 | AUTHN-2 (and adapter-model) | `authentication.md:227-228`; `adapter-model.md:115` | `scripts/test-level.mjs:13,33-40`; `contracts/vitest.config.js:6`; `ci.yml` | test gap |
| D5 | AUTHN-2 | `authentication.md:207-225` | `contracts/src/authentication/index.js:7-9`; `contracts/test/authentication.test.js:5` | test gap / unspecified |
| D6 | AUTHN-2 | `authentication.md:224-225` | `conformance/src/authentication.js:168` | test gap |
| D7 | CONF-4 | `conformance.md:171-174` | `conformance/src/authentication.js:267-269` | behavior (low) or editorial |
| D8 | CONF-4, CONF-6, CF8 | `conformance.md:64,81-83,143-214` | `conformance/test/authentication.test.js:28-32` | editorial |
| D9 | CONF-4 (CD5) | `conformance.md:43-49` | `conformance/test/authentication.test.js:12-25` | test gap (flaky) |
| D10 | none | — | see table | unspecified behavior |
| D11 | none (adapter-model) | `adapter-model.md:52,70,115,184-186,209,221-224` | `contracts/src/adapter.d.ts`, `contracts/package.json` | editorial |

## Statements checked with no drift

- **AUTHN-1** (`unverified (a type only)`): `contracts/src/authentication/types.d.ts:9-12` matches the
  block exactly. Type-level tests exist (`contracts/test/types/contracts.test.ts:51-56`) but are not
  referenced, and are not run in CI (D4).
- **CONF-1**: three exported functions, each taking a constructed instance and a fixture and
  registering a `suite`. The signatures in `conformance/src/index.d.ts:5-18` match the block. The
  vitest peer is `^3.0.0`. `unverified` as recorded.
- **AUTHN-2, apart from D4 to D6**: the signature and types (`contracts/src/authentication/adapter.d.ts`,
  `types.d.ts`) match the block. The array adapter returns `{ rejected: 'credentials' }` for an
  unknown email and a wrong password alike, and returns the entry's `Identity` (`runtime.js:45-48`).
  The tests carrying AUTHN-2 at unit (`runtime.test.js:16-25`) and at conformance (the suite, run by
  the array adapter and the package itself) assert what the statement says.
- **AUTHN-4, apart from D3**: `getIdentity` returns the entry's `Identity` or `null`, never matching
  on email. Tested at unit (`runtime.test.js:27-36`) and conformance.
- **CONF-4, apart from D1, D7 and D8**: the signature, the default of 50 runs, the two-minute
  timeout, IDs in every test title, the creation of no identity, every bullet's inputs (random and
  near-miss passwords, the enumerated near misses at the first, middle and last positions, the other
  identity's password, emails compared ignoring case, the subjects tried, the disabled identity's
  alternatives, sequences), and the throttle allowance for `authenticate`. Its named test files
  exist and carry CONF-4: `conformance/test/authentication.test.js`,
  `authentication-adapter-array/test/conformance.test.js`, and
  `adapter-gcp/test/contract/authentication.test.ts:72`.
- **AUTHN-5, AUTHN-6, AUTHN-7**: test references only. They exist and carry their IDs. The code is
  outside this audit's scope, except D2.
- **AUTHN-8 to AUTHN-11, CONF-2, CONF-3, CONF-5**: New and not implemented, as recorded (`none yet`).
  The current storage and database suites differ from CONF-2 and CONF-3 exactly as CF7 and CF9
  describe. **CONF-6**: partly implemented, see D8.
