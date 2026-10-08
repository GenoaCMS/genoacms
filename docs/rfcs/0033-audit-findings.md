---
type: rfc
number: 33
title: Close the most important findings of the 2026-10-08 audits
status: draft
commits: []
depends: [30, 32]
architecture: [architecture/adapter-gcp/deployment.md, architecture/adapter-gcp/storage.md, architecture/adapter-gcp/authentication-identity-platform.md, architecture/contracts/authentication.md, architecture/contracts/conformance.md, architecture/cli.md]
changes: [ADP-5 compatible, ADP-6 compatible, AUTHN-3 compatible, CONF-4 compatible, CLI-11 compatible, CLI-12 compatible]
commit-subject: "fix: close the most important findings of the 2026-10-08 audits (RFC-0033)"
---

# RFC-0033: Close the most important findings of the 2026-10-08 audits

## Summary

Four drift audits (GS14, WS9, CS5, LS3) and one falsification audit (CS6, GS13) ran at `9f43931`.
Their reports are in `docs-audit/`. This RFC takes only the findings that are important and cheap:
a fix where the statement already says what the code must do, a test where the code is right but
nothing pins it, and the two array-adapter fixes the author chose on 2026-10-09. Every other finding
stays in its report.

1. **The request URL keeps its host** (GF35, ADP-5). A path starting with `//` no longer names
   another host, which may have let a cross-site form pass SvelteKit's CSRF check.
2. **An empty `X-Forwarded-For` throws** (GF36, ADP-6), as a header with 0 entries.
3. **The array adapter's construction errors** start with `authentication/`, and name entries by
   index, never by email (CF31, AUTHN-3). An entry without a string password is refused (CF32, AUTHN-4).
4. **The authentication suite** accepts a throttled `getIdentity` (CF37), checks the answers to wrong
   passwords in its sequence, and tries transforms of passwords and subjects (CF43, CONF-4).
5. **`init` checks for an existing config first** (LF14, CLI-12). **`roles` quotes a role name** that
   is not an identifier (LF15, CLI-11).
6. **Tests only, with the code unchanged:** the Identity Platform gaps (GF34), every storage method's
   bucket check (GF37), and core's sign-in and revalidation gaps (CF42).
7. **`@genoacms/contracts`' tests and type checks run in CI** (CF33).

## Files

**Modify or create only:**

| File | Change |
| :-- | :-- |
| `packages/sveltekit-adapter-cloud-run-functions/src/request.js` | `requestUrl` and `clientAddress` (§Specification 1, 2) |
| `packages/sveltekit-adapter-cloud-run-functions/tests/request.test.js` | tests (§Tests) |
| `packages/authentication-adapter-array/src/runtime.js` | construction checks and messages (§Specification 3) |
| `packages/authentication-adapter-array/src/runtime.test.js` | tests; the two existing construction tests change their assertions (§Tests) |
| `packages/conformance/src/authentication.js` | the suite (§Specification 4) |
| `packages/conformance/test/mutants/authentication.js` | new mutants, and a `CONFORMING` map (§Tests) |
| `packages/conformance/test/mutants/authentication.mutant.js` | looks the adapter up in `MUTANTS`, then in `CONFORMING` |
| `packages/conformance/test/authentication.test.js` | a test that runs each `CONFORMING` adapter (§Tests) |
| `packages/cli/src/init.js` | the check first (§Specification 5) |
| `packages/cli/src/init.test.js` | test through `init()` |
| `packages/cli/src/roles.js` | the role name quoted (§Specification 5) |
| `packages/cli/src/roles.test.js` | test |
| `packages/adapter-gcp/src/authentication/identity-platform/runtime.test.ts` | tests only |
| `packages/adapter-gcp/src/storage/runtime.test.ts` | tests only |
| `packages/core/src/lib/script/auth/session.server.test.ts` | tests only |
| `packages/core/src/lib/script/auth/auth.server.test.ts` | tests only |
| `packages/core/src/lib/script/auth/providers.server.test.ts` | tests only |
| `packages/contracts/test/*.test.js` → `packages/contracts/src/*.test.js` | moved with `git mv`; their `../src/` imports become `./` |
| `packages/contracts/vitest.config.js` | `include: ['src/**/*.test.js']` |
| `packages/contracts/package.json` | `files` gains `"!src/**/*.test.js"` |
| `.github/workflows/ci.yml` | a step after Build: `pnpm --filter @genoacms/contracts run check` |
| `docs/architecture/contracts/authentication.md` | AUTHN-2's `Test:` names the moved file; AUTHN-3's names the array test (step 6) |
| the architecture documents in `architecture` | updated to current (step 6) |

## Specification

The statements' new text is in the architecture documents, committed before this RFC. In brief:

**1. ADP-5** gains: "In both cases the request path and query are appended to the origin as text:
a path that starts with `//`, such as `//evil.example/x`, stays a path on the same host and never
names another host." `requestUrl(req, origin)` returns `new URL(base + (req.url || '/')).href`,
where `base` is `origin` without a trailing `/` when `ORIGIN` is set, else
`` `${protocol}://${hostname}` ``. A URL that cannot be parsed still throws, and the handler still
answers `400 Bad Request`.

**2. ADP-6** gains: "A header that is present but empty, or holds only commas, has 0 entries."
`clientAddress` falls back to the socket's address only when the header is `undefined`. Otherwise
it counts the entries, and with fewer than `depth` throws the existing message
`XFF_DEPTH is <depth>, but X-Forwarded-For has <n> entries`.

**3. AUTHN-3** gains: "This holds for its construction too: a runtime's `create` that refuses its
options or its resolved credentials throws such an error. … No message the adapter composes
contains an email or a password, from its arguments or from its configuration." AUTHN-4 is
unchanged; the array adapter now meets "could sign in now". `create` checks, in this order, and
throws at the first that fails:

| Check | Message |
| :-- | :-- |
| `credentials` is an array | `authentication/missing-credentials` |
| every entry's `subject` is truthy | `authentication/missing-subject: at index <i>[, <j>…]` |
| every entry's `password` is a string | `authentication/missing-password: at index <i>[, <j>…]` |

Indexes are zero-based positions in the resolved array, in ascending order, joined with `, `.

**4. CONF-4** gains three things, and the suite implements them:
- *Password transforms, as examples:* for each identity, the right password reversed, doubled, cut
  by one character at the start, cut by one at the end, followed by `\0`, and followed by the other
  identity's password. Each that differs from the right one must return `{ rejected: 'credentials' }`
  or throw `authentication/throttled…` (`answersOrThrottles`). This is in the test
  `AUTHN-2: a wrong password is rejected for credentials`.
- *Subject variants, as examples:* `'\u200b' + subject`, the subject with `'\u0301'` inserted after
  its first character, and the subject with its first ASCII letter replaced by its fullwidth form
  (code point + `0xFEE0`), when it has one. Each that differs from the subject must return `null`.
  This is in `AUTHN-4: getIdentity returns null for an unknown subject`.
- *Wrong passwords in the sequence:* the `wrong` steps of
  `AUTHN-2, AUTHN-4: the right answers do not change across calls` check their answer like the others:
  `{ rejected: 'credentials' }`, or a throw starting with `authentication/throttled`.

The text that is already there decides CF37: in the test `AUTHN-4: getIdentity returns null for an
unknown subject`, both the examples and the property accept a throw starting with
`authentication/throttled` (`answersOrThrottles(() => adapter.getIdentity(subject), null)`).

**5. CLI-12**'s refusal now comes "before any prompt, install or write". `init()` calls
`existingConfigFile(process.cwd())` right after `intro`, and throws `cli/config-exists: <path>` from
there. `prepareConfig` keeps its own check. **CLI-11** gains: "A role name is printed as written
when it is a JavaScript identifier, and as a JSON string otherwise, as keys are." `roles.js` prints
the name through the same rule `render` uses for keys: export it from `declaration.js` as
`renderKey(key)`, and use it in both places.

## Non-goals

- Every other finding of the reports, including the GCP adapter's ADP-5 edge cases (D3 to D5), the
  AWS deploy waits (D1, D2), and the CLI's cancellation paths (D3 to D5, D7). They stay in
  `docs-audit/`.
- An architecture document for the array adapter (CF36), and its other unspecified behavior.
- AUTH-8's "never stored" (part of GF34). It needs a restatement, not a test.
- CF43's throttling reading: an adapter that throttles every wrong input still passes the suite.
- `isRejection` (CF34), `second-factor-required` (CF35), and the vague readings CS6 lists.
- Changing what the core, Identity Platform or storage code does. Their tests are added only to
  pin what the code already does.

## Tests

All titles carry their statement IDs. **(xfail)** marks a test that fails until the code changes;
it is written first, with `it.fails`. Every other test is expected to pass at once. One that fails
shows a defect: stop and record it (discovery rule).

`packages/sveltekit-adapter-cloud-run-functions/tests/request.test.js` (unit):
- `ADP-5: a path starting with // keeps the request's host` **(xfail)**: given `req.url`
  `//evil.example/x?y=1`, when `requestUrl` runs with `ORIGIN` `https://cms.example.com`, then the
  result is `https://cms.example.com//evil.example/x?y=1`; and without `ORIGIN`, with
  `Host: cms.example.com`, it is `http://cms.example.com//evil.example/x?y=1`.
- `ADP-6: an empty X-Forwarded-For has no entries` **(xfail)**: given `X-Forwarded-For: ''`, when
  `clientAddress` runs at depth 1, then it throws `XFF_DEPTH is 1, but X-Forwarded-For has 0 entries`;
  and the same for `''` given as a one-element array.

`packages/authentication-adapter-array/src/runtime.test.js` (unit):
- `AUTHN-3: a value that is not a list is refused with an authentication/ error`: given
  `credentials: { ada }`, when `create` runs, then it throws exactly `authentication/missing-credentials`
  **(xfail)**. It replaces the test `refuses a value that is not a list`.
- `AUTHN-3: entries without a subject are named by index, never by email` **(xfail)**: given entries
  0 (valid), 1 and 3 without a subject (emails `one@x`, `three@x`), when `create` runs, then it throws
  exactly `authentication/missing-subject: at index 1, 3`, and the message contains no `@`. It replaces
  the test `refuses an entry without a subject, naming its email`.
- `AUTHN-3, AUTHN-4: an entry without a string password is refused` **(xfail)**: given entry 1 with no
  `password`, and, in a second case, entries 1 and 2 with `password: 123` and `password: null`, when
  `create` runs, then it throws `authentication/missing-password: at index 1`, and
  `… at index 1, 2`.

`packages/conformance/test/authentication.test.js` (conformance), with adapters from
`packages/conformance/test/mutants/authentication.js`:
- `CONF-4: an adapter that only throttles where the statement allows it passes the suite` **(xfail)**:
  given each adapter of a new `CONFORMING` map, run in a child Vitest as the mutants are, then no test
  of the suite fails. Its one entry, `'getIdentity throttles'`, throws `authentication/throttled` from
  `getIdentity` for every subject other than the two fixture subjects.
- `CONF-4: each assertion fails against its mutant`, unchanged, gains these `MUTANTS`. It is marked
  `it.fails` while the suite cannot yet catch them, and the marker goes with step 3:
  - `'a wrong password after a lookup is disabled'`, failing `AUTHN-2, AUTHN-4: the right answers
    do not change across calls`: after any `getIdentity`, the next wrong password for a known email
    answers `{ rejected: 'disabled' }`.
  - `'the reversed password signs in'` and `'the doubled password signs in'`, failing
    `AUTHN-2: a wrong password is rejected for credentials`.
  - `'an invisible prefix finds the subject'` (strips a leading `\u200b`) and
    `'a fullwidth subject is found'` (compares NFKC forms), failing
    `AUTHN-4: getIdentity returns null for an unknown subject`.

`packages/cli/src/init.test.js` (unit):
- `CLI-12: init refuses an existing config before any prompt or install` **(xfail)**: given a
  directory with no `package.json` and an existing `genoa.config/security.ts`, as the working
  directory, with `@clack/prompts`' `select` and `spinner` and `node:child_process`' `exec` mocked,
  when `init()` runs, then it rejects with `cli/config-exists: <that path>`, `select` and `exec` were
  never called, and the directory holds only `genoa.config/security.ts`. Restore the working directory
  afterwards.

`packages/cli/src/roles.test.js` (unit):
- `CLI-11: a role name that is not an identifier is printed quoted` **(xfail)**: given the role name
  `Content editor` and one grant, when `roles` composes it, then the noted text contains
  `"Content editor": [`, and evaluating `({ <text> })` for the noted text does not throw. Given
  `Copywriter`, the text contains `Copywriter: [` unquoted.

`packages/adapter-gcp/src/authentication/identity-platform/runtime.test.ts` (unit):
- `AUTH-10, AUTH-7: any non-200 lookup status throws and is sent once`: for each status in `400..599`
  (a property, or every value), when `getIdentity` answers that status, then it rejects with a message
  starting `authentication/provider-failed: <status>`, and `fetch` was called once.
- `AUTH-2, AUTH-7: any sign-in status other than the mapped ones is sent once`: the same for
  `authenticate`, with statuses `401..599` and `400` with an unmapped code; `fetch` was called once.
- `AUTH-2, AUTH-10: the tenant is sent on both calls, with and without an API key`: given
  `tenantId: 'cms-tenant'`, in the four combinations of method and `apiKey`, then each request body
  holds `tenantId: 'cms-tenant'`.
- `AUTH-2: the password is sent exactly as given`: given the password `'  pass word\t'`, then the
  body's `password` is exactly `'  pass word\t'`.
- `AUTH-6, AUTH-7: only a 400 with TOO_MANY_ATTEMPTS_TRY_LATER is throttled`: given
  `429 { error: { message: 'RESOURCE_EXHAUSTED' } }`, and `503` with `TOO_MANY_ATTEMPTS_TRY_LATER`,
  then each throws `authentication/provider-failed: <status> <message>`, not `authentication/throttled`.

`packages/adapter-gcp/src/storage/runtime.test.ts` (unit):
- `STO-3: every method refuses an unregistered bucket before any request`: for each of `getObject`,
  `getPublicURL`, `uploadObject`, `moveObject`, `deleteObject`, `getSignedURL`, `listDirectory`,
  `createDirectory`, `deleteDirectory` and `moveDirectory`, given a reference whose bucket is not in
  `ctx.resources` (the source, for the two moves), when it is called with valid other arguments, then
  it throws `bucket-unregistered`, and no method of the mocked `Storage`, bucket or file was called.

`packages/core/src/lib/script/auth/session.server.test.ts` (unit):
- `AUTHN-6, AUTHN-7: the family keeps its provider across rotations, also when the email changes`:
  given a family started with provider `b`, and a revalidation that returns a new email each time,
  when it is refreshed 8 times, then every rotated family read back from storage has `provider: 'b'`,
  and the revalidation received provider `b` every time.
- `AUTHN-7: the grace window carries the family's email unchanged`: given a family whose stored email
  is `' Ada@Example.com '`, when the just-superseded token is presented within the grace window, then
  the result's email is exactly `' Ada@Example.com '`.

`packages/core/src/lib/script/auth/auth.server.test.ts` (unit):
- `AUTHN-5: a failing authorization check admits nobody`: given `signIn` admitting
  `{ subject: 's', email }` and `resolvePrincipal` rejecting, when `login` runs, then it rejects,
  `startSession` was not called, and no cookie was set.

`packages/core/src/lib/script/auth/providers.server.test.ts` (unit):
- `AUTHN-5: the throttled prefix is matched with its case`: given a single provider throwing
  `Authentication/Throttled: slow down`, and in a second case `AUTHENTICATION/THROTTLED`, when
  `signIn` runs, then the result is `sign-in-unavailable`.

## Steps

1. Baseline. Run §Verification and record the test counts of every package touched.
2. Tests. A session that has not seen the code changes writes §Tests. The **(xfail)** tests use
   `it.fails` (the mutant entry: commit it with `tests` naming the test that fails today). The others
   must pass; if one fails, stop. Commit: `test: tests for the audit findings, failing where the code changes (RFC-0033)`.
3. Code, in this order, each with its markers removed and each assertion unchanged: `request.js`;
   the array adapter; the suite; `init.js` and `roles.js` with `renderKey`. Commit:
   `fix: close the most important findings of the 2026-10-08 audits (RFC-0033)`.
4. CF33: move the contracts tests, the vitest config, `files`, and the CI step. Run
   `pnpm --filter @genoacms/contracts test` and `node scripts/test-level.mjs unit`, and confirm that
   the contracts report now holds the `AUTHN-2` test. Commit: `ci: run @genoacms/contracts' tests and type checks (CF33, RFC-0033)`.
5. Run §Verification.
6. Documents to current. The findings become *History.*, `fixed, RFC-0033`, in their tables and
   registers: GF34 (but AUTH-8, which stays open as GF34's remainder: reword the row), GF35, GF36,
   GF37, CF31, CF32, CF33, CF37, CF42, CF43 (but the throttling reading), LF14, LF15. Name the new test
   files in AUTHN-3's and AUTHN-2's `Test:` lines. This RFC: `implemented`, with its commits. Commit:
   `docs: RFC-0033 implemented`.

## Verification

```bash
pnpm --filter @genoacms/sveltekit-adapter-cloud-run-functions test     # all pass
pnpm --filter @genoacms/authentication-adapter-array test              # all pass, conformance included
pnpm --filter @genoacms/conformance test                               # all pass; the mutant test lists the new mutants
pnpm --filter @genoacms/cli test                                       # all pass
pnpm --filter @genoacms/adapter-gcp test                               # all unit tests pass; contract tests skipped
pnpm --filter @genoacms/core test                                      # all pass
pnpm --filter @genoacms/contracts test && pnpm --filter @genoacms/contracts run check
node scripts/test-level.mjs unit && node docs/tools/check-results.mjs docs reports/unit
node docs/tools/check-docs.mjs docs                                    # 0 errors
```

A falsification audit of ADP-5, ADP-6, AUTHN-3, AUTHN-4 (array adapter), CONF-4, CLI-11 and CLI-12,
by an agent that did not write the code, recorded as a Verification entry in each document.

## Critique

**Pros**
- It closes the one finding with a security consequence (GF35) and the two privacy and lockout gaps
  in the array adapter (CF31, CF32), each with a regression test.
- Most of it is tests for code that is already right, so little can break, and the statements the
  falsification audit broke are pinned.
- `@genoacms/contracts`' tests stop being decorative (CF33).
- The audits are not wasted: what is fixed is recorded as fixed, and the rest is recorded with a
  pointer to its report.

**Cons & trade-offs**
- The array adapter's new messages change what an operator sees. A config with an entry without a
  password, which loaded before, now fails at the first sign-in instead of locking only that user.
- An empty `X-Forwarded-For` now fails the request instead of falling back. Behind Google's front end
  the header is never empty, but a client sending one directly to the function gets an error.
- A conforming adapter that answered a near-miss transform as `disabled` or with an identity was
  already wrong, but it now fails the suite, which third-party adapter authors will notice.
- Seventy-odd findings stay only in reports, outside the documents' tables, so `check-docs` does not
  know them.

**Blindspots & missed edge cases**
- GF35's exploit was inferred, not run. If Google's front end normalizes `//`, the fix is still right
  but the risk was lower than stated.
- `ORIGIN` with a path (`https://host/base`) is now joined as text; ADP-7 says `ORIGIN` is "used as
  given", and the old resolution dropped a base path for paths starting with `/` anyway. A test with
  a trailing `/` on `ORIGIN` would settle it; this RFC strips one trailing `/` only.
- The fullwidth variant exists only for subjects with an ASCII letter. A subject made only of digits
  or symbols gets the other two variants.
- The array adapter accepts any truthy subject, `1` included (CF36); this RFC does not tighten it.
- `init`'s check runs before the prompts, but the files it would write do not depend on the answers
  today. If a template ever does, the early check must use the answers, or check twice.
- The tests for core assume `refreshSession`'s storage and revalidation can be faked as the existing
  tests do. If CF22(4)'s whole chain is needed to observe the provider, the test belongs one level up.
