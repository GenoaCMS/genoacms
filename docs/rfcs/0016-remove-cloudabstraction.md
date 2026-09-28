---
type: rfc
number: 16
title: Delete `@genoacms/cloudabstraction`
status: draft
commits: []
depends: [15]
architecture: [configuration.md]
commit-subject: refactor!: remove @genoacms/cloudabstraction
sections: legacy
---

# RFC-0016: Delete `@genoacms/cloudabstraction`

| | |
| :-- | :-- |
| Depends on | RFC-0015 |
| Architecture | §5.1; §10 (every row now points away from the package) |
| Commit | `refactor!: remove @genoacms/cloudabstraction` |

## 1. Summary

After RFC-0015 nothing imports `@genoacms/cloudabstraction`. This RFC:
- deletes the package;
- moves its one misplaced test, the permission vocabulary, to `@genoacms/internal`, where the code it tests lives;
- updates the remaining comments and the root README that name it.

## 2. Files

**Delete:** `packages/cloudAbstraction/` (the whole directory).

**Create:** `packages/internal/src/authorization/permissions.test.js`. Its content is
`packages/cloudAbstraction/test/permissions.test.js`, with the import path changed from
`'../src/authorization/permissions.js'` to `'./permissions.js'`. Nothing else changes.

**Modify:**

| File | Change |
| :-- | :-- |
| `packages/internal/src/index.d.ts:4`, `packages/internal/src/index.js:8`, `packages/internal/src/components/languageAdapter.d.ts:13`, `packages/internal/src/components/attributes.d.ts:141`, `packages/internal/README.md` (lines 10, 38, 56) | Replace `@genoacms/cloudabstraction` with `@genoacms/contracts`. Where a sentence contrasts `internal` with "what an adapter must implement", it now names `@genoacms/contracts`. |
| `README.md` (root) | The package table: replace the `packages/cloudAbstraction` row with rows for `packages/contracts` (`@genoacms/contracts`), `packages/config` (`@genoacms/config`) and `packages/conformance` (`@genoacms/conformance`), each with a one-line description in the table's style. The workspace-linking example: `"@genoacms/cloudabstraction": "workspace:^"` → `"@genoacms/contracts": "workspace:^"`, and `cloudAbstraction` → `contracts` in the sentence after it. |
| `pnpm-lock.yaml` | via `pnpm install` |

## 3. Non-goals

- No documentation-site changes (RFC-0017).
- No change to `@genoacms/internal`'s code beyond the moved test and the comments.

## 4. Steps

1. Confirm that nothing imports the package (see §5, first command). Stop if anything is listed.
2. Move the test, then delete the directory.
3. Edit the comments and the README.
4. Run `pnpm install`, then §5.

## 5. Verification

```bash
grep -rn "@genoacms/cloudabstraction\|cloudAbstraction" --include=*.ts --include=*.js --include=*.svelte --include=*.json --include=*.md . \
  | grep -v node_modules | grep -v "/dist/" | grep -v "^./docs/" | grep -v "^./packages/docs/" | grep -v pnpm-lock.yaml
```

**Expected:** no output. `docs/` (architecture and RFCs) and `packages/docs` (RFC-0017) are excluded.

```bash
pnpm install
pnpm --filter @genoacms/internal run test
pnpm -r --no-bail run test 2>&1 | tail -20
```

**Expected:**
- `internal`'s tests pass, including the moved permission test. It **failed before this RFC** because its import pointed at a path that did not exist in `cloudAbstraction`; record that in the commit body.
- The workspace test run has no failures beyond the baseline recorded in RFC-0014 step 1.

## 6. Critique

**Pros.** One contract package instead of two. The permission test runs again, next to the code it
pins.

**Cons.** This is a breaking removal of a published package name (`0.8.11` exists on npm). Nothing is
released as stable (architecture header), so no deprecation release is planned. An `npm deprecate`
pointing to `@genoacms/contracts` is a separate, author-run step.

**Blindspots.** External projects pinned to `@genoacms/cloudabstraction` keep working against the
old published versions, but get no fixes. That is acceptable only because there are no users
(architecture header).
