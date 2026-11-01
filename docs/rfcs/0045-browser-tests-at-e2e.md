---
type: rfc
number: 45
title: Every browser test of core at the e2e level
status: draft
depends: [39, 43]
architecture: [architecture/authorization.md, architecture/signing.md, architecture/contracts/authentication.md, architecture/components.md, architecture/collections.md, architecture/build.md, README.md]
changes: [ROL-1 added, ROL-2 added, ROL-3 added, ROL-4 added, ROL-5 added, KEY-1 added, KEY-2 added, KEY-3 added, KEY-4 added, AUTHN-12 added, SRC-5 added, CMP-9 compatible]
commit-subject: "test(core): every browser test at the e2e level (RFC-0045)"
---

# RFC-0045: Every browser test of core at the e2e level

## Summary

Core had two browser suites. `packages/core/e2e/*.test.ts` (Vitest in `--mode e2e`, driving
Chromium through the `playwright` library) runs in CI's `e2e` job and counts in
`verification.json`. `packages/core/tests/*.spec.ts` (Playwright Test) built with the development
config, which imports gitignored credential files, so nothing ran it (`build.md` F32). The SvelteKit
3.1 `form_field_unbound` regression (`components.md` NF20) shipped past it. RFC-0043's critique
says that suite "runs in CI on `main`". That claim is wrong, and RFC-0043 is not edited: this RFC and
F32 correct it.

The author decided on 2026-11-01:

1. One harness. Every browser test of core runs in `e2e/` under Vitest; `playwright.config.ts`,
   `tests/` and the `@playwright/test` dependency go.
2. A test that checks no statement first gets one. The roles screen and the key registry screen get
   documents of their own, `authorization.md` (ROL-1 to ROL-5) and `signing.md` (KEY-1 to KEY-4),
   each specifying only its screen (ZU1, YU1). The admin area's guard is AUTHN-12. The code editor's
   unsaved-changes guard is SRC-5.
3. The grant editor's tests all run at `e2e`.
4. The demo scenarios become a script outside the test directories, `pnpm demo` and
   `pnpm demo:clean`. The fixture sweep is removed: every e2e run removes its own instance.
5. Three gaps the port found are closed at `e2e`: HIS-2, the registrar's delete confirmation
   (CMP-9), and SRC-5.
6. No workflow change. A test file that no level runs is not refused by any checker (Non-goals).

Every new statement documents behavior the code already has. No code of core changes.

What moves where:

| Old file | Tests | Outcome |
| :-- | :-- | :-- |
| `tests/components.spec.ts` | 24 | ported to `e2e/components.test.ts` (in the working tree before this RFC) |
| `tests/pages.spec.ts`, `pageComposition.spec.ts`, `revisionPinning.spec.ts` | 5 + 22 + 7 | ported to `e2e/pages.test.ts`, merged where they repeat each other: 18 tests |
| `tests/grantEditor.spec.ts`, `keys.spec.ts` | 13 + 8 | ported to `e2e/configuration.test.ts`: 19 tests |
| `tests/smoke.spec.ts` | 4 | the admin guard ported to `e2e/signIn.test.ts` (AUTHN-12); the landing page, its login link and the login form deleted: every e2e file signs in through that form |
| `tests/collections.spec.ts` | 6 | deleted as duplicates of `e2e/collections.test.ts` (LST-1, LST-6, DOC-5, DOC-6, EDT-2) |
| `tests/storage.spec.ts` | 4 | deleted as duplicates of `e2e/storage.test.ts` (BRW-6, BRW-7, BRW-8, BRW-10) |
| `tests/selection.spec.ts` | 14 | deleted as duplicates of LST-2 to LST-4, DOC-7, BRW-5, BRW-10, BRW-12, BRW-14 |
| `tests/sweep.spec.ts` | 1 | deleted |
| `tests/demoFixtures.spec.ts`, `demoCleanup.spec.ts`, `support/demo.ts` | 5 + 3 | rewritten as `packages/core/demo/demo.ts`, outside every level |

## Files

**Modify or create only:**

| File | Change |
| :-- | :-- |
| `packages/core/e2e/components.test.ts` | the 24 ported tests (already present); three more, and SRC-5 in the title of the unsaved-changes test |
| `packages/core/e2e/pages.test.ts` | new: 18 tests |
| `packages/core/e2e/configuration.test.ts` | new: 19 tests |
| `packages/core/e2e/signIn.test.ts` | one test, AUTHN-12 |
| `packages/core/demo/demo.ts` | new: the demo content, `publish` and `clean`, through the `playwright` library |
| `packages/core/package.json` | remove `test`, `test:integration`, `test:demo`, `test:demo:clean` and `@playwright/test`; add `demo`: `node demo/demo.ts publish`, `demo:clean`: `node demo/demo.ts clean` |
| `packages/core/tsconfig.json` | `include`: `demo/**/*.ts` in place of `tests/**` |
| `packages/demo-support/src/page.ts` | the hint names `pnpm --filter @genoacms/core run demo` |
| `pnpm-lock.yaml` | follows `package.json` |
| `packages/core/tests/` | removed, `README.md` and `support/` with it |
| `packages/core/playwright.config.ts` | removed |
| `docs/architecture/*.md`, `docs/README.md` | the statements of this RFC; Test lines and Verification once the tests pass |

`.github/workflows/ci.yml` and `scripts/test-level.mjs` do not change: `test-level.mjs e2e` runs
`vitest run --mode e2e e2e` in every package with an `e2e/` directory, so the new files run in the
`e2e` job, write `reports/e2e/packages-core.xml` and are counted by `record.mjs`. The job keeps its
pinned actions.

## Specification

New statements, as written in the documents: ROL-1 to ROL-5 (`authorization.md`), KEY-1 to KEY-4
(`signing.md`), AUTHN-12 (`contracts/authentication.md`), SRC-5 (`components.md`). Each documents
behavior already present; `added` is their kind because this RFC names them.

CMP-9 gains a paragraph:

> The registrar's `Delete component` dialog asks `To confirm deletion, type "<name>":`, and its
> `Yes, delete <name>` stays disabled until the text typed equals the component's name.

These statements gain the level `e2e`, besides `unit`: CMP-3, CMP-6, CMP-7, CMP-8, CMP-10, SRC-2,
SRC-3, HIS-1, HIS-2, PUB-3, PUB-4, PUB-5, PUB-7, PGE-2 to PGE-9, TRE-1, TRE-2. A level is not part
of a statement's text (WORKFLOW §11.3).

## Non-goals

- **No checker refuses a test file that no level runs.** The author decided against a workflow
  change on 2026-11-01. A new Playwright Test file, or a test outside the globs of
  `test-level.mjs`, would again gate nothing unnoticed.
- No change to core's code. A test that fails on reality is a finding, and this RFC is amended
  first (discovery rule).
- No Vitest browser mode tests. The two selection tests about layout (a checkbox clear of its row;
  the delete control not moving on a second `Select all`) are dropped with `selection.spec.ts`:
  LST-2 states the control's position, and no statement states the checkbox's layout.
- The landing page and the login form's fields have no statement and no test.
- The rest of authorization and signing (the grant model, resolution, manifests, envelopes, the
  registry document) stays unspecified.
- The concurrency of two e2e runs in one bucket (`docs/README.md`, known gaps) stays.
- YF1, whether a secret write restarts the dev server, is not investigated.

## Tests

All at level `e2e`, in `packages/core/e2e/`, run with `vitest run --mode e2e`, against core built
with `genoa.config/e2e.ts` and served by `startServer`. Each file removes the instance before and
after it (`removeInstance`), signs in through the login form (`signedInSession`), names its fixtures
with a per-run suffix, and is skipped unless `GENOACMS_TEST_GCP=1`. Users: `ada`
(`e2e-ada`, Administrator) and, in `configuration.test.ts`, `carol` (`e2e-carol`, TestReader). Old
files are named for each test. The development config and the credential files are never read.

### `components.test.ts`, three added

| Title | Given / when / then |
| :-- | :-- |
| `HIS-2: a save from an editor opened before another save is refused, and the other save is kept` | Given a dynamic component open in the code editor in two tabs; when the first saves the body `return 1` and the second then saves `return 2`; then the second shows `Changed elsewhere. Reload to see the latest version.`, and the editor opened again shows `return 1`. |
| `CMP-9: the registrar's Yes, delete stays disabled until the name is typed in full` | Given a prebuilt component open in the registrar, and its `Delete component` dialog open; when all of its name but the last character is typed; then `Yes, delete <name>` is disabled; when the last is typed, it is enabled. Nothing is submitted. |
| `SRC-5: an editor with unsaved changes asks before leaving, and declining keeps the body` | The existing test without an ID, renamed: given a body typed and not saved; when a link inside the CMS is followed and the dialog dismissed; then the dialog said `unsaved changes`, the page is still the editor and the body is kept. |

### `pages.test.ts` (from `pages.spec.ts`, `pageComposition.spec.ts`, `revisionPinning.spec.ts`)

Set up once: a prebuilt page component with a `components` slot `body`, and one prebuilt component
per other attribute type (`boolean`, `number`, `string`, `text`, `markdown`, `richText`, `link`,
`storageResource`), each with one attribute, saved and published, as the old suite did.

| Title | Given / when / then |
| :-- | :-- |
| `PGE-2, PGE-3: a page created from a published component is listed, and opens on its root node` | Given the page component; when `Create page` creates a page of it; then the page's screen is headed by its name and shows the slot `body`, and `/components/pages` lists it. |
| `PGE-6: a preview URL is saved and kept across a reload` | Given a page; when `Update preview URL` saves `https://example.com/preview`; then `Edit successful` shows, and after a reload the preview's iframe has that `src`. |
| `PGE-4: a value edited in the node editor is saved and kept across a reload` | Given a page with the string component nested; when its value is edited to a text of the run and `Save` is pressed; then `Saved` shows, and after a reload the nested node's editor shows that text. |
| `TRE-1: Build writes the page's tree to .genoacms/pages/readables/<name> as a genoacms.pageTree.v1 envelope` | Given a page; when `Build` is pressed; then `Saved` shows, and the object `.genoacms/pages/readables/<name>`, read through the GCP adapter, is a JSON envelope of type `genoacms.pageTree.v1`. |
| `PUB-7: a component never published is offered neither as the root of a new page nor for a slot` | Given a prebuilt component registered and saved, not published; then `Create page`'s component select offers the page component and not it, and a page's `Add component` dialog offers the string component and not it. |
| `PGE-5, PGE-3: components added to a slot are listed in the order added, and kept across a reload` | Given a page; when the eight attribute components are added to `body`, one after another; then the nested cards name them in that order, and after a reload in the same order. |
| `PGE-3: a nested node opens in the node editor with its attributes` | Given that page; when the first nested card's `Edit` is followed; then the editor shows the attribute `booleanValue`. |
| `PGE-7, HIS-1: undo removes the node added last, and redo restores it, on the screen and in storage` | Given a new page with three nested components; when `Undo` is pressed; then the screen and, after a reload, the page lack the third; when `Redo` is pressed; then the screen and, after a reload, the page have all three in order. |
| `PGE-4: a node removed from the slot stays removed after saving and a reload` | Given a new page with three nested components; when the last is deleted, confirmed with `Yes`, and the page saved; then after a reload the first two remain, in order. |
| `PGE-4: dragging a nested node onto its sibling swaps them` | Given a new page with three nested components; when the first card's `Dragger` is dragged onto the second; then the first two cards are swapped. |
| `TRE-1, TRE-2: a page nesting a component of every attribute type builds, with a node per component` | Given the page with the eight attribute components; when `Build` is pressed; then no error shows, and the tree's root node has `component` the page component's name and a `body` of eight nodes naming the eight components in order. |
| `CMP-10, CMP-9: deleting a component a published page pins names the page and is refused, and the component stays` | Given a built page with the boolean component nested; when the boolean component's `Delete component` dialog opens; then it names the page; when its name is typed and `Yes, delete` pressed; then the dialog reports the use by a published page, and the registrar still shows the component. |
| `CMP-10: the delete dialog of a component no published page pins says so` | Given a prebuilt component saved and nested nowhere; when its `Delete component` dialog opens; then it shows `No published page uses this component`. |
| `TRE-2, PGE-9: a built page pins its component's publication, and a newer publication leaves the built tree unchanged` | Given a dynamic component whose body returns `'first'`, published, and a page of it, built; then the tree's root node carries a `publicationId` (a UUID); when the body is changed to return `'second'`, saved and published; then the tree's `publicationId` is unchanged. |
| `TRE-2: building the page again pins the newer publication` | Given that page; when it is built again; then the tree's `publicationId` is a UUID other than the first. |
| `PUB-4, PUB-5: each publication of a dynamic component keeps its own executable` | Given that component, published twice; then `.genoacms/components/public/<uid>/` holds two objects. |
| `PGE-8: deleting pages in one action removes their entries and trees` | Given two built pages of the run; when both are selected on `/components/pages`, `Delete selected` confirmed with the phrase shown; then neither is listed, and neither `.genoacms/pages/entries/<name>` nor `.genoacms/pages/readables/<name>` exists. |
| `CMP-9: deleting a dynamic component removes its source, its header and every publication` | Given that dynamic component, no longer pinned by a page; when it is deleted from the code editor; then `Component deleted` shows, and nothing is left under `.genoacms/components/` naming its uid. |

### `configuration.test.ts` (from `grantEditor.spec.ts`, `keys.spec.ts`)

The grant editor's tests read the hidden field `grants` of the open dialog, parsed as JSON, and
submit nothing, except the four ROL-5 tests that save. Those create a role `e2e-role-<run>` in the
run's instance. `<bucket>` is `GENOACMS_TEST_GCP_BUCKET`, the only bucket of the e2e config, which
declares the collections `test`, `authors` and `articles`.

| Title | Given / when / then |
| :-- | :-- |
| `ROL-1, KEY-1: the configuration index links an administrator to Roles and access and Signing keys, and shows neither to a reader` | Given `ada`; when `/configuration` opens; then its `Roles and access` and `Signing keys` cards lead to `/configuration/iam`, titled `Roles and access`, and `/configuration/keys`, titled `Signing keys`. Given `carol`; then `/configuration` shows neither card. |
| `ROL-2: a permission is chosen by category and value, and leaves the row incomplete until a resource is on` | Given `New role` open; when `storage:bucket:read` is chosen on the `Storage` tab; then `Applies to` shows, and the grants are `[]`. |
| `ROL-3: a bucket switched on becomes one grant over that bucket` | Given that row; when the switch `<bucket>` is clicked; then it is checked, and the grants are `[{ permission: 'storage:bucket:read', resource: { scope: 'bucket', id: <bucket> } }]`. |
| `ROL-3: several collections switched on in one row become one grant each, in order` | Given `db:collection:delete` chosen on `Database`; when `test`, then `authors` are switched on; then the grants are one per collection, `test` first, each `{ scope: 'collection' }`, without `fields`. |
| `ROL-3: Any bucket is off at first, and on becomes one grant over *` | Given `storage:bucket:read` chosen; then `Any bucket` is unchecked; when it is clicked; then the grants are `[{ permission: 'storage:bucket:read', resource: '*' }]`. |
| `ROL-3: an instance-scoped permission becomes one grant over *` | When `pages:read` is chosen on `Content`; then the grants are `[{ permission: 'pages:read', resource: '*' }]`. |
| `ROL-2, ROL-3: a collection read row shows its fields once the collection is on, and records the fields switched on` | Given `db:collection:read` chosen; when `test` is switched on; then `Every field` shows, unchecked, and the grants are `[]`; when the field `name` is switched on; then the grants are `[{ permission: 'db:collection:read', resource: { scope: 'collection', id: 'test' }, fields: ['name'] }]`. |
| `ROL-3: Every field records the grant without fields` | Given `db:collection:read` on `test`; when `Every field` is clicked; then the grant has no `fields`. |
| `ROL-3: read and write rows over one collection keep their own field selections` | Given a row of `db:collection:read` on `test` with `Every field`; when `Add grant` adds a row of `db:collection:write` on `test` with the field `name`; then the grants are the read grant without `fields`, then the write grant with `fields: ['name']`. |
| `ROL-4: Add grant appends a row, and Remove grant removes it with its grants` | Given a complete bucket row; when `Add grant` is pressed; then the grants are unchanged (one); when the first row's `Remove grant` is pressed; then the grants are `[]`. |
| `ROL-5: New role closed without creating reopens with one new row` | Given `New role` with a complete bucket row; when `Close` is pressed and `New role` opened again; then the grants are `[]`. |
| `ROL-5: a created role reopens with its grants, without a reload` | Given `New role` named `e2e-role-<run>` with `storage:bucket:read` on `<bucket>`; when `Create` is pressed; then the dialog closes, and the role's `Edit` opens `Grants of e2e-role-<run>` with exactly that grant. |
| `ROL-5: a role saved again reopens with the grants of the second save` | Given that role open for editing; when `Any bucket` is switched on and `Save` pressed; then the dialog closes, and `Edit` opens it with exactly `[{ permission: 'storage:bucket:read', resource: '*' }]`. |
| `ROL-5: Delete asks, and Yes removes the role` | Given that role; when its `Delete` is pressed; then the confirmation reads `Delete the role "e2e-role-<run>". Anyone holding it loses what it granted.`; when `Yes` is pressed; then `Role deleted` shows, and no card is headed `e2e-role-<run>`. |
| `KEY-2: the root anchor shows its public key in full, and nothing on the screen rotates the root` | Given `/configuration/keys`; then the card `Root trust anchor` shows a base64 text of at least 40 characters, and no button's name matches `rotate…root` or `root…rotate`. |
| `KEY-2: the registry shows its sequence, and exactly one current key, listed first` | Then the card `Registry` shows `sequence`, and among the cards under `Subordinate keys` exactly one shows `current`, and it is the first. |
| `KEY-3: Rotate mints a new current key, and keeps the outgoing one as superseded` | Given the current key's id and the number of key cards; when `Rotate` is pressed; then `Rotated. New signatures use the new key.` shows, there is one card more, the old key's card shows `superseded`, and the current key's id differs. |
| `KEY-4: Revoke states that earlier signatures stop verifying, and No changes nothing` | Given the current key; when its `Revoke` is pressed; then the confirmation contains `stops verifying` and `before now`; when `No` is pressed; then no card shows `revoked` for it, and it is still current. |
| `KEY-4: a revoked key stays listed as revoked, without Revoke, and one key stays current` | Given a rotation just done; when the key it superseded is revoked with `Yes`; then `Key revoked` shows, its card shows `revoked` and has no `Revoke`, and exactly one card shows `current`. |

### `signIn.test.ts`, one added

| Title | Given / when / then |
| :-- | :-- |
| `AUTHN-12: every page of the admin area redirects to / without a session, and / and /login answer 200` | Given no cookie; when `/dashboard`, `/collections`, `/components/registrar`, `/components/pages`, `/configuration`, `/configuration/iam`, `/configuration/keys` and `/storage` are requested without following redirects; then each answers 303 with `location: /` and a body without the page; and `/` and `/login` answer 200. |

## Steps

1. Commit the documents: the new statements, `Level: e2e` on the statements of § Specification,
   F32, the README rows (docs commit).
2. Commit this RFC.
3. Write the tests of § Tests. Run each file:
   `GOOGLE_APPLICATION_CREDENTIALS=$PWD/genoa.config/gcp/serviceAccount.json GENOACMS_TEST_GCP=1 npx vitest run --mode e2e e2e/<file>.test.ts`
   from `packages/core`. A test that fails because the screen does not do what a statement says is
   a finding: stop, and amend this RFC and the document before changing the test. Commit in groups:
   components, pages, configuration and sign-in.
4. Write `demo/demo.ts`, change `package.json`, `tsconfig.json` and `demo-support`, update the lock
   file (`pnpm install`). Commit (CI and tooling).
5. Remove `packages/core/tests/` and `playwright.config.ts`. Commit.
6. Update the documents to current: Test lines naming the e2e files, Verification sections,
   `docs/README.md` counts, `verified`. Commit.

## Verification

```bash
cd packages/core
GOOGLE_APPLICATION_CREDENTIALS=$PWD/genoa.config/gcp/serviceAccount.json GENOACMS_TEST_GCP=1 \
  pnpm exec vitest run --mode e2e e2e --reporter=default --reporter=junit --outputFile.junit=../../reports/e2e/packages-core.xml
# every test passes
pnpm exec vitest run --exclude 'e2e/**'
# unit: all pass
pnpm run check
# 0 errors
cd ../..
node docs/tools/check-docs.mjs docs
# 0 error(s)
node docs/tools/check-results.mjs docs e2e=reports/e2e/packages-core.xml --defer unit --defer integration --defer contract --defer conformance
# no error for a statement of this RFC
git ls-files packages/core | grep -E '\.spec\.ts$|playwright\.config'
# nothing
```

In CI the `e2e` job runs the whole level; its duration before this RFC was 10 to 15 minutes on
`main` (2026-10-30 to 31).

A falsification audit of every statement this RFC adds or changes, by an agent that did not write
the tests, recorded as a Verification entry in the statement's document.

## Critique

**Pros**
- Every browser test of core runs in CI, carries statement IDs, and gates releases through
  `verification.json`. A regression like NF20 now fails the `e2e` job.
- One harness, one config, one instance per file: no fixture sweeps, no cleanup through the
  storage browser, no credential files.
- Two subsystems that had no Specification now have their screens specified, and the README's
  coverage says what of them is still missing.
- About 30 duplicate tests go instead of being ported.

**Cons & trade-offs**
- The `e2e` job grows by about 40 tests driving real GCS, estimated at 4 to 6 minutes and the
  matching cloud calls on every push and pull request.
- Playwright Test's retries and traces are gone. The old suite retried once for eventual
  consistency; these tests wait on the specific reads instead, so a lagging read shows as a failure
  rather than a flaky pass.
- The demo script drives a server it does not start, with credentials from the environment:
  `pnpm demo` against the dev server needs `GENOACMS_DEMO_EMAIL` and `GENOACMS_DEMO_PASSWORD`.
- New statements documenting existing behavior are `added`, so the next release of core needs at
  least a patch above 0.y for them although nothing changed for users.

**Blindspots & missed edge cases**
- Nothing stops a new test file from landing outside every level again (Non-goals).
- The roles screen is tested with one bucket, so "several buckets in one row" is checked on
  collections only; a defect specific to bucket switches would pass.
- AUTHN-12 covers page loads. Form actions and remote functions of the admin area do not pass
  through its layout's `load`, and their own checks are not stated here.
- Revocation runs in the run's instance; that its keys are removed at the end relies on
  `removeInstance`, and the secrets file `.genoacms/e2e-secrets.env` keeps the seeds across runs.
- The drag test depends on pointer events reaching the drag library, which the old suite needed a
  step-wise move for; it may prove flaky in headless CI.
- RFC-0043's wrong claim stays in a frozen RFC; only F32 and this RFC correct it.
