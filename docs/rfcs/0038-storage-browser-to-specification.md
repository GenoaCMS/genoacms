---
type: rfc
number: 38
title: The storage browser to its Specification, with the CMS's state read-only
status: implemented
commits: [813d2b5]
depends: [37]
architecture: [architecture/storage.md]
changes: [STS-4 compatible, BRW-3 compatible, BRW-6 breaking, BRW-7 compatible, BRW-8 compatible, BRW-9 compatible, BRW-10 compatible, BRW-11 compatible, BRW-12 compatible]
commit-subject: "fix(core): storage browser names, moves, denials, bulk results, paging and a read-only .genoacms (RFC-0038)"
---

# RFC-0038: The storage browser to its Specification, with the CMS's state read-only

## Summary

`storage.md` was written on 2026-10-18 from the code, and the reading found ten defects (BF1 to
BF10). The author decided BU1 to BU5 the same day. This RFC, after RFC-0037:

1. Makes `.genoacms/` in the default bucket read-only for users: listed and readable, never written,
   moved or deleted through the user layer (STS-5; BU1; BF1).
2. Takes each name a user types as one level, refusing `.`, `..`, `/` and the delimiter, and never
   joins names with a path library (BRW-13; BU2; BF2, part of BF7).
3. Renames a directory and only it, and leaves an item already in the target directory where it is
   (BRW-8, BRW-9; BF3, BF4).
4. Checks `contents` before acting on it (BRW-11; BF5).
5. Answers a denial with 403, checking every item before acting on any (BRW-16; BU3; BF6).
6. Acts on several items one at a time, reporting which failed (BRW-14; BU4; BF9).
7. Shows a long directory a page at a time, with `Show more` (BRW-15, STS-4; BU5; BF8).
8. Names the picker's confirm button `Confirm selection`, as the collection listing's (BRW-12; BF10).
9. Gives every `STS` and `BRW` statement a test that carries its ID.

## Files

**Modify or create only:**

| File | Change |
| :-- | :-- |
| `packages/core/src/lib/script/storage/user.server.ts` | STS-5; `listUserDirectory` takes `params`; `requireUserWrites`, `requireUserDeletes` |
| `packages/core/evidence/permissionMatrix.ts`, `permissionMatrix.test.ts` | the two new checks in the matrix; the storage mock gains `defaultBucketId` |
| `packages/core/src/lib/script/storage/user.server.test.ts` | the existing tests retitled with STS IDs; the tests of §Tests |
| `packages/core/src/lib/script/storage/browserPaths.ts` | new, pure: the path, names and `contents` of BRW-2, BRW-11, BRW-13 |
| `packages/core/src/lib/script/storage/browserPaths.test.ts` | new: its unit tests |
| `packages/core/src/routes/(admin)/storage/+page.server.ts` | unchanged behavior; STS-1 |
| `packages/core/src/routes/(admin)/storage/[bucketId]/[...path]/contents/+page.server.ts` | the load and the five actions of §Core |
| `packages/core/src/routes/(admin)/storage/[bucketId]/[...path]/contents/actions.test.ts` | new: the actions' unit tests |
| `packages/core/src/routes/(admin)/storage/[bucketId]/[...path]/contents/listing.remote.ts` | new: `nextPage`, for `Show more` |
| `packages/core/src/routes/(admin)/storage/[bucketId]/[...path]/contents/+page.svelte` | the loaded entries, `Show more` |
| `packages/core/src/routes/(admin)/storage/[bucketId]/[...path]/contents/ShowMore.svelte` | new: the button |
| `packages/core/src/routes/(admin)/storage/[bucketId]/[...path]/contents/Selection.svelte` | `Confirm selection`; Select all over the loaded entries |
| `packages/core/src/routes/(admin)/storage/[bucketId]/[...path]/contents/ObjectUpload.svelte`, `ConfirmMove.svelte`, `Delete.svelte` | the BRW-14 message and selection |
| `packages/core/src/routes/(admin)/storage/[bucketId]/[...path]/contents/RenameModal.svelte`, `Directory.svelte` | the directory's own name, ending in `/`, sent as `name` |
| `packages/core/src/lib/script/storage/bulkResult.ts`, `bulkResult.test.ts` | new, pure: BRW-14's message, and its unit test |
| `packages/core/e2e/storage.test.ts` | new: the e2e tests of §Tests |
| `packages/core/src/lib/script/storage/SelectionRune.svelte.ts` | the selection is kept per tab in `sessionStorage`, so a reload keeps it (BRW-5); a picker starts from its opener's value alone (BRW-12) |
| `packages/core/src/lib/components/ContextMenu.svelte`, `ContextMenuItem.svelte` | the menu and its items have the roles `menu` and `menuitem` (BRW-4, BRW-8) |
| `packages/core/src/lib/components/CardLinkContents.svelte` | the icon is `aria-hidden`, so a card is named by its text alone (BRW-3) |
| `packages/core/src/routes/(admin)/storage/[bucketId]/[...path]/contents/ConfirmMove.svelte` | the button is named `Move here` (BRW-4, BRW-9) |
| `packages/core/src/routes/(admin)/storage/[bucketId]/+page.server.ts` | redirects to the absolute `/storage/<bucket>/contents` (BRW-1) |
| `packages/core/e2e/collections.test.ts` | the two PCK-2 tests confirm the storage picker with `Confirm selection`, its new name (BRW-12) |
| `packages/core/src/routes/(admin)/storage/+page.svelte`, `.../contents/Directory.svelte` | links carry the page's query string as is, without a lone `?` (BRW-1) |
| `packages/core/genoa.config/e2e.ts` | a reader of the e2e bucket: `e2e-dan`, assigned a role holding only `storage:bucket:read` on it |
| `.changeset/storage-browser-to-specification.md` | new: `minor` for `@genoacms/core` |
| `docs/architecture/storage.md` | to current, step 6 |

## Specification

**STS-4 · A listing carries signed URLs** (changed, compatible): adds "The listing is one page of
the adapter's (`contracts/storage.md` STOR-11), and carries its `next`; the next page is listed with
`pageToken: next`."

**STS-5 · The CMS's state is read-only for users** (added): as `storage.md` states it.

**BRW-3 · A directory** (changed, compatible):

> The page is titled with the directory's name, and shows the directories loaded, then the files
> loaded (BRW-15), each in the order the adapter lists them (`contracts/storage.md` STOR-11). A
> directory shows its own level's name, its trailing `/` removed, and opens it. A file shows its
> `filename` and opens its signed URL in a new tab.

**BRW-6 · Uploading** (changed, breaking): the file's name follows BRW-13, and several files follow
BRW-14.

> `Upload object` opens `Upload files`, with a file input taking several files. Each file is written,
> without a condition, to the directory's name followed by the file's name (BRW-13); an existing
> object of that name is replaced. While it runs the browser shows `Uploading`; then `Upload
> successful` and the directory reloads, or a failure as BRW-14 and BRW-16 say. A submission without
> files does nothing.

**BRW-7 · Creating a directory** (changed, compatible): "The directory created is the directory's
name followed by the name given and `/` (BRW-13)."

**BRW-8 · Renaming** (changed, compatible):

> `Rename` opens `Rename` with `New name:`, filled with the current name. The item keeps its directory
> and takes the new name (BRW-13): a file `<directory><name>` moves to `<directory><newName>` by
> `moveObject`; a directory `<directory><name>/` moves, with every object under it, to
> `<directory><newName>/` by `moveDirectory`, and nothing outside it moves. The browser shows
> `Renaming`, then `Renamed` and reloads, or `Renaming failed` with the dialog open again.

**BRW-9 · Moving here** (changed, compatible):

> Move here moves each selected item of the bucket shown into the directory shown, under its own last
> level's name. An item whose parent is the directory shown, and an item of another bucket, are left
> where they are and are not counted. A directory moved into itself or below itself fails, as an item
> (BRW-14). The browser shows `Moving`, then `Moved`, empties the selection and reloads, or a failure
> as BRW-14 and BRW-16 say.

**BRW-10 · Deleting** (changed, compatible): "and shows `Deleting`, then `Deleted`, empties the
selection and reloads, or `Deletion failed`" becomes "…, or a failure as BRW-14 and BRW-16 say".

**BRW-11 · Malformed submissions** (changed, compatible): adds two rows; a malformed `contents`
reaches no item.

> | Action | Invalid | `reason` |
> | :-- | :-- | :-- |
> | move, delete | `contents` that is not a JSON array of objects with a string `bucket` and a string `name`, or an empty array | `invalid-contents` |
> | upload, create directory, rename | a name BRW-13 refuses | `invalid-name` |

**BRW-12 · The browser as a picker** (changed, compatible): "the selection control confirms" becomes
"the selection control is a button named `Confirm selection`, which sends the selection and closes
the tab once the opener acknowledges".

**BRW-13 to BRW-16** (added): as `storage.md` states them.

### Core

`browserPaths.ts`, pure:

```ts
// BRW-2: '' for the root; else the levels between delimiters, each ending in '/', concatenated
function directoryOfRoute (path: string, delimiter: string): string
// BRW-13
function isAcceptedName (name: string, delimiter: string): boolean
// BRW-11: the references, or undefined when malformed or empty
function parseContents (value: FormDataEntryValue | null): ObjectReference[] | undefined
function parentOf (name: string): string            // 'a/b/' → 'a/', 'a/f' → 'a/', 'f' → ''
function lastLevelOf (name: string): string         // 'a/b/' → 'b/', 'a/f' → 'f'
```

`directoryOfRoute` splits `path` on the delimiter and joins the non-empty parts, so a level's own
`/` is kept and only the delimiter between levels goes; the same split serves the back link.

`user.server.ts` adds:

```ts
class InternalReadOnlyError extends Error {}         // message: storage/internal-read-only: <name>
const isInternalStateName = (bucket: string, name: string): boolean
// '.genoacms/' covers it, it covers '.genoacms/', or it is '': in the default bucket only
function requireUserWrites (ctx: AuthContext, references: ObjectReference[]): void
function requireUserDeletes (ctx: AuthContext, references: ObjectReference[]): void
```

Every write, move, rename and delete function checks STS-5 on its reference, and a move also on its
destination, after the permission. `requireUserWrites` and `requireUserDeletes` run the same checks for every reference,
throwing the first refusal, and acts on nothing.

The route's actions:

```pseudo
load:      directory = directoryOfRoute(params.path)
           list one page (STS-4); a PermissionDeniedError → error(403)
action:    parse; malformed → fail(400, { reason })
           requireUserWrites / requireUserDeletes(every item);  PermissionDeniedError → fail(403, { reason: 'permission-denied' })
                                            InternalReadOnlyError → fail(403, { reason: 'internal-read-only' })
           for each item, in order: act; collect failures by name
           any failed → fail(500, { done, failed })
```

`listing.remote.ts` exports `nextPage = query('unchecked', { bucket, directory, pageToken })`, which
lists through `listUserDirectory` and `processUserDirectoryContents`, and throws on a denial as the
load does. `bulkResult.ts` gives BRW-14's message: `bulkFailureMessage(done: number, total: number,
verb: 'uploaded' | 'moved' | 'deleted', failed: string[]): string`.

## Non-goals

- Directory names that already contain the delimiter (BF7): they still cannot be opened.
- Hiding `.genoacms/`, or a permission of its own: BU1 keeps it readable.
- Conditional uploads, or asking before replacing an object (BRW-6 keeps replacing).
- Moving across buckets.
- The dashboard's recent directories.

## Tests

- `packages/core/src/lib/script/storage/user.server.test.ts` (unit), the storage service stubbed:
  - The existing 15 tests, retitled: those of `reading`, `writing`, `moving`, `deleting` carry
    `STS-2`, plus `STS-3` for `does not carry from one bucket to another`, `does not imply reading`,
    `needs write rather than delete` and `is denied to a principal holding only delete`;
    `getUserBucketReferences`' tests carry `STS-1`. Assertions unchanged.
  - › `STS-2: a denial names the subject, the permission and the bucket, and calls no adapter`: the
    message is `permission-denied: '<subject>' lacks storage:bucket:write on 'b'`.
  - › `STS-4: a listing gives each file its filename and a URL signed for one hour, and carries next`:
    given a fake clock and a stubbed page with `next: 't'`, then each file's `signedURL` was signed
    for `now + 3600 s`, `filename` is the last level, and `next` is `t`; a `pageToken` reaches the
    storage service.
  - › `STS-5: every change under .genoacms/ in the default bucket is refused, after the permission`:
    for upload, move, rename and delete of the object `.genoacms/x`; create, move, rename and delete
    of the directories `.genoacms/` and `.genoacms/sub/`; a move of `photos/a` to `.genoacms/a`, and
    of `photos/d/` to `.genoacms/d/`; each by a principal holding every permission, then each rejects
    with `storage/internal-read-only: <name>` and the service is not called; a principal without the
    permission gets `PermissionDeniedError` instead.
  - › `STS-5: reads under .genoacms/, other buckets, and other names are not affected`: listing
    `.genoacms/` is allowed with read; `.genoacms/x` in another bucket, and `.genoacmsx/y` and
    `photos/.genoacms/` in the default bucket, are written.
- `packages/core/src/lib/script/storage/browserPaths.test.ts` (unit):
  - › `BRW-2: the route's path is the directory's name, levels kept whole`: `''` → `''`;
    `|->photos/` → `photos/`; `|->photos/|->2024/` → `photos/2024/`; `|->a/|->/|->b/` → `a//b/`.
  - › `BRW-13: names of one level are accepted, others refused`: accepted `a.png`, `a b`, `..a`,
    `ü`; refused `''`, `.`, `..`, `a/b`, `/`, `a|->b`.
  - › `BRW-11: contents is a non-empty JSON array of references`: refused `x`, `{}`, `[]`, `[1]`,
    `[{"bucket":1,"name":"a"}]`, `[{"bucket":"b"}]`; accepted `[{"bucket":"b","name":"a/"}]`.
- `packages/core/src/lib/script/storage/bulkResult.test.ts` (unit): › `BRW-14: the message counts
  what was done and names what failed`: `(3, 5, 'moved', ['a.jpg', 'b/'])` is `3 of 5 moved. Failed:
  a.jpg, b/`.
- `.../contents/actions.test.ts` (unit), the user layer real, the storage service stubbed:
  - › `BRW-7, BRW-13: a directory is created as the directory, the name and /`: `createDirectory` of
    `x` in `photos/` creates `photos/x/`.
  - › `BRW-8: renaming a directory moves it and nothing beside it`: given `photos/2024/` and
    `photos/2024-old/`, when `2024` is renamed `2025`, then `moveDirectory` receives `photos/2024/`
    and `photos/2025/`, once.
  - › `BRW-9: an item already in the directory shown is left, and a directory is not moved below
    itself`: given `photos/a` and `photos/d/` selected, when moving into `photos/`, then nothing moves;
    when `photos/d/` is moved into `photos/d/x/`, then it fails as an item, named `photos/d/`.
  - › `BRW-11, BRW-13: malformed submissions fail with 400 and touch nothing`: each row of BRW-11's
    tables, and `invalid-name` for upload, create directory and rename.
  - › `BRW-14: several items run one at a time and the failures are reported`: given 5 items of which
    the 2nd and 4th fail, then the service saw 5 calls in order, never two at once, and the action
    fails with 500 and `{ done: 3, failed: [<2nd>, <4th>] }`.
  - › `BRW-16: a denial of any item is 403 and acts on nothing`: given a delete of `photos/a` and
    `.genoacms/x` in the default bucket, then 403 with `internal-read-only` and no service call; a
    principal without delete gets 403 with `permission-denied`.
  - › `BRW-16: a listing the principal may not read is 403`.
- `packages/core/e2e/storage.test.ts` (e2e), core built and served as the collections suite does,
  with the administrator, a reader of the bucket, and a fixture directory `e2e-<run>/` written
  through the GCP adapter and removed afterwards:
  - › `STS-1, BRW-1: the bucket list shows the buckets the principal holds a grant on, and opens a bucket's root`.
  - › `BRW-1, BRW-2: links keep the query string, and the path names each level`: opening
    `e2e-<run>/` then `sub/` from the root with `?selectionId=x` reaches
    `/storage/<bucket>/|->e2e-<run>/|->sub//contents?selectionId=x`, titled `e2e-<run>/sub/`; back
    leads to `e2e-<run>/`, and from the root to `/storage`.
  - › `BRW-3: directories, then files, each opening`: a directory opens its listing; a file's link
    has `target=_blank` and an `href` that serves its bytes.
  - › `BRW-4: the toolbar shows what the principal may use`: the administrator sees move and delete
    after selecting, create directory and upload; the reader sees only the selection control, and no
    `Rename`.
  - › `BRW-5: select all, unselect all, and a selection that follows navigation`.
  - › `BRW-6, BRW-14: uploading two files lists both, and replaces one of the same name`.
  - › `BRW-7, BRW-13: a directory is created, and a name with / is refused`.
  - › `BRW-8: renaming a directory leaves its sibling of a longer name in place`.
  - › `BRW-9: moving here moves the selection, and leaves what is already here`.
  - › `BRW-10: deleting asks with the counts, and declining deletes nothing`: `Do you want to delete
    one directory and 2 files?`.
  - › `BRW-12: as a picker, directories have no checkbox and Confirm selection returns the selection`.
  - › `BRW-14: a partial failure names the failed items and keeps only them selected`: one delete
    answered 500 by the test through the page's request interception for the action, with
    `{ done: 1, failed: ['e2e-<run>/b.png'] }`; the toast reads `1 of 2 deleted. Failed:
    e2e-<run>/b.png`.
  - › `BRW-15: Show more loads the next page into the view`: a fixture directory of 1001 files; the
    first load shows 1000 and `Show more`; after it, 1001 and no button.
  - › `STS-5, BRW-16: .genoacms/ opens for reading, and an upload into it is refused`: the toast is
    `Upload failed`, and the object is not written.

## Steps

1. Baseline after RFC-0037: `pnpm --filter @genoacms/core exec vitest run` passes; the collections e2e
   suite passes; `node docs/tools/check-docs.mjs docs` reports 0 errors.
2. Tests: written from `storage.md` and this RFC by a session that has not seen the route's code; each
   that fails before the code marked `it.fails`; the new modules' unit tests come with the code.
   Commit.
3. `user.server.ts`, `browserPaths.ts`, `bulkResult.ts`.
4. The route, the remote query and the components.
5. Remove every `it.fails`, change no assertion, add the changeset. Commit. Run §Verification.
6. `storage.md` to current: the changed statements take §Specification's text; STS-5 and BRW-13 to
   BRW-16 lose their `State:` lines; every `STS` and `BRW` statement names its tests; BF1 to BF6, BF8
   to BF10 fixed, BF7 mitigated; `verified` moves; `docs/README.md` counts.

## Verification

```bash
pnpm --filter @genoacms/core exec vitest run
# all pass
GENOACMS_TEST_GCP=1 pnpm --filter @genoacms/core exec vitest run --mode e2e e2e
# all pass, storage.test.ts among them
node docs/tools/check-docs.mjs docs
# 0 error(s)
```

A falsification audit of every `STS` and `BRW` statement (WORKFLOW §6.3), by an agent that did not
write the code, recorded as a Verification entry in `storage.md`.

## Critique

**Pros**
- The CMS's state can no longer be damaged through the browser, while staying open for debugging,
  as the author wants it.
- A typed name means one thing: one level, appended as given, so no `..` or `/` in it changes where
  something lands.
- A rename and a move do what they say, and a partial failure says what was left undone, so the
  user can retry exactly that.
- Every browser statement gets a test, most of them end to end, closing the gap the document's
  Verification records.

**Cons & trade-offs**
- One item at a time makes uploading or deleting many files slower than today.
- A file whose own name contains `/` or the delimiter, legal in the store, cannot be uploaded from the
  browser under that name.
- A 500 with `{ done, failed }` is a failure status for a partial success; the browser reads its body
  rather than its status.
- The read-only rule is by name, so a caller of the unchecked storage service bypasses it (BD1).
- The checks of `requireUserWrites` / `requireUserDeletes` and of each operation can disagree if a grant changes between
  them; the operation's check still decides.

**Blindspots & missed edge cases**
- `Show more` keeps a token across user actions: after a delete or a move the next page continues
  from the old listing, and may repeat or miss an entry until the page reloads.
- Select all selects what is loaded; a delete of "everything" in a directory longer than a page
  leaves the rest, and the question does not say so.
- An upload of two files of the same name in one submission writes one after the other; the last
  wins, and both count as done.
- The e2e partial-failure test intercepts the action's answer, so it shows the browser's handling,
  not a real failing adapter.
- Names are checked for `/` and the delimiter only; control characters and very long names reach the
  store, which refuses some of them as an item's failure.
