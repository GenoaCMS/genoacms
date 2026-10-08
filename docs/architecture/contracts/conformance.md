---
type: architecture
title: Conformance suites
codes: [CONF]
verified: b571980
---

# Conformance suites

Part of the [service contracts](README.md). Markers, IDs and test references as defined there.

## Design

### Role

`@genoacms/conformance` is the executable form of the service contracts: one suite per service, which
every adapter of that service runs against an instance it constructed, first-party and third-party
alike (`WORKFLOW.md` §6.5). An adapter passes a suite when the suite's tests pass against it. The
package is published, so its exports are an API that adapter authors depend on.

A suite checks only what its service's contract states. It does not test what is specific to one
service (preconditions on GCS generations, Firestore names): that belongs to the adapter's own tests
and contract tests. Today the suites cover storage and database. Neither contract is specified yet
([`README.md`](README.md)), so their suites are, for now, the only executable statement of those
contracts.

Who runs them, and at which level: the package's own tests run each suite against in-memory adapters
(`conformance`); `adapter-postgres` runs the database suite against a local Postgres
(`conformance`); `adapter-gcp` and `adapter-aws` run both against the real services (`contract`),
with credentials only (`docs/README.md`, test levels).

### Decisions

**CD4. A suite test checks only contract statements, and carries their IDs.** CONF-2 to CONF-6.
*Why:* a suite that asserts something no contract states makes adapters fail on behavior nobody
promised, and one whose tests carry no IDs cannot be traced to what it verifies. Today each adapter
wraps a whole suite in a `describe` carrying the adapter's own statement IDs (`STO-4`, `DB-3` to
`DB-7`, `OBJ-3`, `DDB-4` to `DDB-7`), so every suite test counts for every one of them, including
statements it does not check.
*Cost:* the storage and database suites can carry IDs only once those contracts are specified. Until
then they carry none, and an adapter's wrapping `describe` remains the only link.

**CD5. Each assertion of a suite is shown to fail against an adapter that violates it.** CF8.
*Why:* a suite runs inside other packages' test runs, so a check that cannot fail goes unnoticed
everywhere at once. The package's own tests therefore run each suite against the in-memory adapter
and against one mutant per assertion (a wrong body, an update that does nothing, an empty listing),
and expect the mutant to fail exactly that test. This is the falsification audit (`WORKFLOW.md`
§6.3) made permanent for the one package whose tests are other packages' evidence.
*Cost:* every new assertion needs its mutant, and the mutants encode the in-memory adapter's shape.

**CD6. A suite works on names unique to its run, and removes what it wrote.** CONF-2, CONF-3.
*Why:* the suites run against real buckets and databases, the production project's on GCP
(`adapter-gcp/README.md` GU6). A fixed name collides between concurrent runs, and a run that fails
midway leaves its object or document behind.
*Cost:* the cleanup runs even after a failed step, so it can mask the original failure in the log if
it fails too; the suite reports the first failure.

### Findings

| # | Finding | State |
| :-- | :-- | :-- |
| CF6 | *History.* **The storage suite's read check could not fail its test.** `is getting uploaded object` asserts inside the stream's `end` handler and does not wait for it. Against an adapter that returns the wrong body, the test passes and the assertion surfaces as an unattributed unhandled error of the run. Shown 2026-10-02 with a mutant adapter. The read is now awaited; no test yet shows that the check fails a wrong body (CF8). | fixed, `f22136c` |
| CF7 | **The database suite uses the second document for every step, and checks neither the update nor the listing.** `documentData = testDocuments[1]` runs while vitest collects the tests, before any of them, so `createDocument` receives `testDocuments[1]` and the update writes what is already there. An update that does nothing passes, and so does a listing that returns no document: `lists collection` checks only that the result is an array. Shown 2026-10-02 with a mutant adapter. The contract-level verification of GCP DB-5 and DB-7 rests on this suite alone (GF31); AWS DDB-5 and DDB-7 also have their own contract tests. | open |
| CF8 | **Nothing checks that a suite fails a non-conforming adapter.** The package's tests run each suite only against in-memory adapters that conform, which is how CF6 and CF7 went unnoticed, and why CF6's fix has no regression test. Since RFC-0030 the authentication suite has its mutant test (CF39); the storage and database suites still have none. | open (CD5) |
| CF9 | **The storage suite writes a fixed name, `GenoaCMS/test.txt`, and cleans up only by its own delete step.** On GCP it runs in the production project's bucket (GU6). Two concurrent runs collide, and a run that fails before the delete leaves the object behind. `adapter-aws` avoids this by wrapping the adapter under a per-run prefix; `adapter-gcp` does not. | open (CD6) |
| CF15 | *History.* **The authentication suite does not check the identity's email, nor when `disabled` may be reported.** Its identity checks accept any string as the email (`expect.any(String)`), so an adapter whose `authenticate` or `getIdentity` returns an empty or stale email passes; AUTHN-2 requires the identity the credentials belong to, and AUTHN-4 the current email. No test sends the disabled identity a wrong password, so an adapter that answers `disabled` before checking the password passes. That adapter tells an existing account from a missing one, which AUTHN-2 and CD3 forbid. The suite tries one wrong password, the right one with `-wrong` appended, so an adapter that accepts the empty password, or any prefix of the right one, passes too. Shown 2026-10-02 by CS1 (`authentication.md`). CONF-4, AUTHN-2, AUTHN-4. | fixed, RFC-0030 |
| CF20 | *History.* **The authentication suite tries few inputs, once each.** Each of these adapters passes. (1) A wrong password accepted when it differs from the right one only in case, in its first character, or in surrounding whitespace: the suite's three wrong passwords are fixed. (2) The disabled identity answering `disabled` to an empty or truncated password, which tells an existing account from a missing one: only `-wrong` appended is tried for it. (3) `getIdentity` returning an identity for the fixture's email, a case variant or a prefix of its subject, or `''`: the unknown subject is a random string. (4) An adapter that answers correctly only on the first call, or locks the account after a few wrong passwords: the suite calls each method once per input, in a fixed order. Shown 2026-10-02 by CS2 (`authentication.md`). CONF-4, AUTHN-2, AUTHN-4. | fixed, RFC-0030 |
| CF28 | **The authentication suite catches some faults only by chance, and others not at all.** Its enumerated near misses cover a few kinds of edit at three positions, so a fault in another place, or with another character such as `\n`, is caught only when the random property happens to generate it: in CS4's runs, between 1 and 7 of 8 times. Never caught: a `+tag` or a suffix after `#` ignored, dots ignored in an email's local part without dots, Unicode equivalence (the fixtures are ASCII). Shown 2026-10-02 by CS4 (`authentication.md`). CONF-4. | open |
| CF29 | *History.* **The authentication suite's tests outlast vitest's default timeout against a real provider.** A test sends about 80 calls one after another; at 100 ms each it exceeds 5 s, and `adapter-gcp`'s contract run sets no longer timeout. Found 2026-10-02 by CS4. | fixed, RFC-0030 |
| CF37 | **The authentication suite refuses a throttled `getIdentity`.** The test `getIdentity returns null for an unknown subject` runs a property that expects `null`, and does not accept an error whose message starts with `authentication/throttled`; CONF-4 accepts one anywhere in a property. A rate-limited lookup fails the suite. The properties over `authenticate`, and the sequence, accept it. Found 2026-10-08 by CS5 (`authentication.md`). CONF-4. | open, RFC-0033 |
| CF38 | **The authentication suite requires the same answer on every call.** The sequence property also compares each answer with the first answer to the same call, so a disabled identity answered `disabled` once and `credentials` later fails; CONF-4 allows either, "every time". Found 2026-10-08 by CS5 (`authentication.md`). CONF-4. | open |
| CF39 | **The mutant test is titled CONF-4, whose text does not state it.** `CONF-4: each assertion fails against its mutant` runs the suite against 20 mutants of the in-memory adapter and expects exactly their tests to fail, which is CD5 and CONF-6 (new) for the authentication suite; RFC-0030 planned it under CONF-4. Found 2026-10-08 by CS5 (`authentication.md`). CONF-4. | open |
| CF40 | **The mutant test can fail its run with an unhandled vitest timeout.** It runs 20 child Vitest runs with `spawnSync`, which blocks the worker for 30 s to 150 s. In 1 of 4 local runs, all 21 tests passed and the run exited 1 on an unhandled error from a vitest timer, after 147 s; CI fails the job on such an error. The full message was not captured. Found 2026-10-08 by CS5 (`authentication.md`). CONF-4. | open |
| CF41 | **The package's behavior that no statement covers, and a stale README.** The authentication suite requires an exact `Identity`, so an adapter returning other fields fails (a reading CS4 left open); `fast-check` is a runtime dependency of the published package; the package's README describes only the storage and database suites. Found 2026-10-08 by CS5 (`authentication.md`). CONF-1, CONF-4. | open |
| CF43 | **The authentication suite ignores the answers to wrong passwords in its sequence, and tries no transforms** (CS6). An adapter that answers `disabled` to a wrong password after any `getIdentity`, one that accepts the reversed or doubled password, and one whose `getIdentity` matches an NFKC-equivalent or zero-width-prefixed subject all pass it. So does an adapter that throws `authentication/throttled` for every wrong input, a reading CS4 left open. Shown 2026-10-08 by CS6. CONF-4, AUTHN-2, AUTHN-4. | open, RFC-0033, except the throttling reading |
| CF23 | *History.* **The authentication suite still samples few inputs.** Each of these adapters passes. (1) A password compared ignoring only leading or only trailing whitespace, the case of its first character, its last or a middle character, or everything but its length and ends. (2) An unknown email that signs in, answers `disabled`, or throws, for a password other than the fixture's: the unknown email is tried once. (3) The disabled identity's password signing the active identity in, and the disabled identity answering `disabled` to its password with a trailing space. (4) Answers that change from the third call on: each input is presented twice. (5) `getIdentity` accepting the subject with a suffix or surrounding whitespace, or answering the disabled identity's email. Shown 2026-10-02 by CS3 (`authentication.md`). CONF-4, AUTHN-2, AUTHN-4. | fixed, RFC-0030 |

### History

*History.* The suites came from `@genoacms/cloudabstraction`'s test helpers, which read a config file
and `testDocuments` from its root. The 2026-09 redesign moved them into their own package, taking a
constructed instance and the fixture as arguments (RFC-0002, `configuration.md` C14, A9). On
2026-10-02 the package got this document; until then no document specified it.

### Verification

The suites' own tests are `packages/conformance/test/storage.test.js` and
`packages/conformance/test/database.test.js`, run at `conformance` against
`packages/conformance/test/memory.js`. Their titles carry no IDs yet. The authentication suite's
own test, `packages/conformance/test/authentication.test.js`, runs it against the in-memory adapter
and against its mutants (CF39).

On 2026-10-02, CF6 and CF7 were shown by running both suites against mutants of the in-memory
adapters, in a test file removed afterwards: one whose `getObject` returns `WRONG CONTENT!!`, one whose
`updateDocument` does nothing and whose `getCollection` returns `[]`. All 12 tests passed; the run
reported one unhandled error, from CF6's assertion.

## Specification

### The package

#### CONF-1 · Calling a suite registers it

`@genoacms/conformance` exports one function per suite. Each takes a constructed adapter instance and
a fixture, never a configuration, and registers a vitest suite when called, so it is called at the top
level of a test file or inside a `describe`. `vitest` is a peer dependency, `^3.0.0`.

```ts
declare function runStorageConformance (adapter: StorageAdapter, fixture: { bucket: string }): void
declare function runDatabaseConformance (
  adapter: DatabaseAdapter,
  fixture: { collection: CollectionReference, testDocuments: [Document, Document] }
): void
```

- Test: `packages/conformance/test/package.test.js`
- Level: conformance

### Storage

#### CONF-2 · The storage suite

Against the fixture's bucket, under a directory name unique to the run, the suite: uploads a text
object, and `uploadObject` resolves to `undefined`; lists the directory, which contains the object
with its size in bytes and a `Date` as `lastModified`; reads the object with `getObject`, whose stream
yields exactly the uploaded bytes before the test ends; deletes it, and `deleteObject` resolves to
`undefined`; lists the directory again, which no longer contains it. When a step fails, the suite
still deletes the object.

- Test: none yet
- Level: conformance
- State: new (no RFC yet)

### Database

#### CONF-3 · The database suite

Against the fixture's collection, the suite: creates `testDocuments[0]`, and the snapshot carries a
reference and that data; reads it back with `getDocument`, which returns the same; updates it with
`testDocuments[1]`, and the snapshot carries that data; reads it back, which returns
`testDocuments[1]`; lists the collection with `getCollection`, which contains the document; deletes
it, and `deleteDocument` resolves to `undefined`. When a step fails, the suite still deletes the
document. The two fixture documents differ.

- Test: none yet
- Level: conformance
- State: new (no RFC yet)

### Authentication

#### CONF-4 · The authentication suite

```ts
declare function runAuthenticationConformance (
  adapter: AuthenticationAdapter,
  fixture: {
    identity: { email: string, password: string, subject: string }
    disabled?: { email: string, password: string, subject: string }
  },
  options?: { runs?: number }
): void
```

The suite checks AUTHN-2 and AUTHN-4 by examples and by properties over generated inputs, each
property with `runs` generated cases (default 50).

- The fixture's credentials return its `Identity`, the fixture's subject and email, and
  `getIdentity` returns it for its subject.
- Any password other than the right one returns `{ rejected: 'credentials' }`, for the fixture and,
  with `disabled`, for the disabled identity. The passwords are generated at random, and as near
  misses of the right one: a character inserted, removed or replaced, the case of one character
  changed, or whitespace before, after or around it. Transforms of the right one are tried as
  examples: reversed, doubled, cut by one character at either end, and followed by `\0` or by the
  other identity's password. Every near miss of these kinds at the first,
  middle and last position is also tried, as an example, and so is the other identity's password.
- Any email that is neither the fixture's nor the disabled identity's, ignoring case, returns
  `{ rejected: 'credentials' }` with any password, the right ones included. The emails are
  generated at random, and as near misses of the fixture's.
- `getIdentity` returns `null` for any non-empty string other than the fixture's subject: generated at
  random, as near misses of the fixture's subject, and the two emails. As examples, it also returns
  `null` for the subject with a zero-width space before it, with a combining mark after its first
  character, and with its first ASCII letter, if any, in its fullwidth form.
- With `disabled`, its correct password returns `{ rejected: 'disabled' }` or
  `{ rejected: 'credentials' }`, and `getIdentity` returns `null` for its subject.
- In any generated sequence of these calls, wrong ones included, the answers to the right
  credentials and to `getIdentity` for both subjects are the ones above, every time, and every wrong
  password returns `{ rejected: 'credentials' }`.

For a wrong password or an unknown email, and anywhere in a property, an error whose message starts
with `authentication/throttled` is also an accepted answer: an adapter that refuses to answer throws
it (AUTHN-3), and a provider may lock an account after many wrong passwords. Each test allows two minutes, because a
real provider answers each of its calls over the network. Each test carries the IDs it checks
(CD4). The fixture's identities exist before the suite runs; the suite creates none, because the
contract cannot.

- Test: `packages/conformance/test/authentication.test.js`, `packages/authentication-adapter-array/test/conformance.test.js`, `packages/adapter-gcp/test/contract/authentication.test.ts`
- Level: conformance

#### CONF-5 · The identity-store suite

```ts
declare function runIdentityStoreConformance (
  adapter: AuthenticationAdapter,
  fixture: { write (record: IdentityRecord): Promise<void>, clear (): Promise<void> }
): void
```

For self-owned stores ([`identities.md`](../identities.md)). The suite writes identity records through
`write`, which puts them into the store in its own layout, and checks PWH-1 to PWH-6 and IDS-1 to
IDS-6 through `authenticate` and `getIdentity`: the test vectors, normalization, rejections and their
reasons, the rehash, and the lookup. `clear` removes every record the suite wrote, after each test.
Each test carries the IDs it checks (CD4).

- Test: none yet
- Level: conformance
- State: new (no RFC yet)

### Every suite

#### CONF-6 · Each assertion fails against a mutant

The package's own tests run each suite against an adapter that violates exactly one of its
assertions, once per assertion, and expect exactly the test holding that assertion to fail (CD5).

- Test: none yet
- Level: conformance
- State: new (no RFC yet)
