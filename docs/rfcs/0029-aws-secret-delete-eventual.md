---
type: rfc
number: 29
title: A second delete of a secret just deleted may resolve true
status: implemented
commits: [1796b78]
depends: [26]
architecture: [architecture/adapter-aws/secrets.md, architecture/adapter-aws/README.md]
changes: [ASM-6 compatible]
commit-subject: "test(adapter-aws): wait for a deleted secret's delete to be visible (ASM-6)"
---

# RFC-0029: A second delete of a secret just deleted may resolve true

## Summary

ASM-6 promised that deleting a secret again resolves `false`. Secrets Manager's reads are
eventually consistent: CI run 36985809717 on `main` saw `DescribeSecret` show a secret live right
after its forced delete, so the second delete resolved `true` (WF27). WS8 did not reproduce it in 36
runs, so it is rare.

ASM-6 now says a second delete resolves `false` once the delete is visible, and may resolve `true`
in the moment before. The runtime is unchanged: core ignores the result of `deleteSecret` (WD6),
and no read can tell a stale answer from a current one. Only the contract test changes, to wait for
the delete to become visible.

## Files

| File | Change |
| :-- | :-- |
| `packages/adapter-aws/test/contract/secrets.test.ts` | modify: the ASM-6 test's second delete is retried (§Tests) |

## Specification

ASM-6 gains, after "It does not wait for the delete to complete.": "For a secret deleted moments
before, `DescribeSecret` can still show it live, and the delete then resolves `true` (WF27); once
the delete is visible it resolves `false`." WD6's cost says the same. No other statement changes.

## Non-goals

- Making `deleteSecret`'s result exact right after a delete: no Secrets Manager read guarantees it.
- Remembering deleted keys in the provider: it would hold only within one process.
- Changing the unit tests: they mock the client and are unaffected.

## Tests

`packages/adapter-aws/test/contract/secrets.test.ts` (contract), `ASM-6: deletes a secret at once,
and reports false for one that does not exist`, title unchanged:
- *Given* a secret created by the test, *when* it is deleted, *then* the delete resolves `true` and
  a read resolves `undefined` (unchanged).
- *When* it is deleted again, repeatedly, once a second, for up to 30 seconds, *then* a delete
  resolves `false` within that time, and no attempt throws.
- *Given* a name that never existed, *when* it is deleted, *then* the delete resolves `false`
  (unchanged).

The test's timeout rises to two minutes.

## Steps

1. The architecture change (WF27, WS8, ASM-6, WD6) and this RFC.
2. The contract test. One commit.
3. Verification; `secrets.md` and the README updated to current: WF27 fixed; this RFC implemented.

## Verification

```bash
pnpm --filter @genoacms/adapter-aws exec vitest run test/contract/secrets.test.ts   # GENOACMS_TEST_AWS=1, AWS_PROFILE=genoacms-contract
node docs/tools/check-docs.mjs docs
```

## Critique

**Pros**
- The contract test stops failing on a rare stale read it cannot control.
- ASM-6 states what Secrets Manager does instead of what it usually does.
- No runtime change, so nothing reaches users.

**Cons & trade-offs**
- A caller cannot rely on `false` meaning "nothing was deleted" right after another delete.
- The contract test can take up to 30 s longer when the stale read occurs.

**Blindspots & missed edge cases**
- The stale read was seen once and never reproduced; its duration is unknown. If it outlasts
  30 s, the test still fails.
- `getSecret` has the same exposure in principle: a stale `DescribeSecret` after an
  `InvalidRequestException` would make it throw instead of resolving `undefined`. WS8 saw no such
  read, and ASM-3 is unchanged.
