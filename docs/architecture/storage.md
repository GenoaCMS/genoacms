---
type: architecture
title: Storage in core
prefix: B
codes: [STS, BRW]
verified: de04f62
---

# Storage in core

## Design

### Role

What core does with the storage service for its users: the permission-checked layer through which
every user operation on a bucket goes, and the storage browser at `/storage`, where users list
buckets and directories, open, upload, rename, move and delete files, and pick files for a document
field.

```
route ──AuthContext──▶ user layer (STS) ──▶ storage service ──▶ host.storageForBucket ──▶ adapter
                        read · write · delete                      (CMS state, unchecked: BD1)
                        per bucket

UI: /storage (buckets) ─▶ /storage/<bucket>/<path>/contents (BRW)
       ▲ picker mode (?selectionId) ── BroadcastChannel ──▶ a files field (collections.md PCK)
```

Out of scope, and specified elsewhere or not yet at all: the storage contract every adapter
implements ([`contracts/storage.md`](contracts/storage.md)); how the host routes a bucket to a
provider and declares the default bucket ([`host.md`](host.md)); the field that opens a picker and
the picker protocol ([`collections.md`](collections.md) PCK-1 to PCK-4); the layout of the CMS's own
state under `.genoacms/`, written by the services that own it; the grant model behind the permissions
named here (no document yet); the dashboard's list of recent directories.

### Decisions

| # | Decision | Where |
| :-- | :-- | :-- |
| BU1 | 2026-10-18: `.genoacms/` in the default bucket is read-only for users. It is listed and its files open as any other's, under `storage:bucket:read`; the user layer refuses every write, move and delete that would change anything under it (BF1). Readable on purpose: the state helps debug the code, and lets a user debug their configuration. That every reader of the default bucket sees each user's subject, email and roles is intended. | STS-5 |

**BD1. Two layers: an unchecked storage service for the CMS, and a user layer that checks a
permission before each operation (STS-1, STS-2).** Every function of the user layer takes the
principal's `AuthContext` first, so a route cannot call it without one.
*Why:* the CMS reads and writes its own state in the default bucket through the storage service,
during the bootstrap, before any principal exists. Checking there would make a copywriter need
bucket write to save a page, and would make a fresh instance impossible to start. A check in the
layer users go through cannot be forgotten by a route, which a check at each route can.
*Cost:* the storage service itself is unchecked, so a route that imports it in place of the user
layer bypasses every permission; the two are told apart only by name (`getObject` against
`getUserObject`). Users of the default bucket reach the CMS's state through the user layer (BF1).

**BD2. Permissions are per bucket: `storage:bucket:read`, `write` and `delete` (STS-2, STS-3).** A
move and a rename are writes.
*Why:* a move relocates rather than removes, so whoever may write may reorganize; only removing
needs `delete`.
*Cost:* nothing finer than a bucket can be granted: a directory, the CMS's state included, cannot be
protected from a user who may write its bucket (BF1).

**BD3. The bucket list shows the buckets the principal holds any grant on (STS-1).**
*Why:* there is no `storage:bucket:list` permission; it was removed as redundant. Filtering on `read`
alone would hide a bucket from a principal who may only upload to it.
*Cost:* a bucket the principal may only write is listed, and opening it fails, because listing needs
`read` (BF6).

**BD4. Users read objects only through signed URLs minted with each listing (STS-4).** The user layer
has no read of an object's content.
*Why:* the browser fetches objects straight from the store, so object bytes never pass through the
CMS. A server-side read for users would be a second path to gate.
*Cost:* every listing signs one URL per file, a request each on Cloud Storage under ADC
(`adapter-gcp/storage.md` GF8). A URL works for an hour after the listing for anyone who has it,
whatever happens to the user's grants meanwhile.

**BD5. The browser hides controls the principal may not use; the user layer decides (BRW-4).**
*Why:* a control that always fails is noise, but a hidden control is no protection: the form actions
are reachable without the page.
*Cost:* the browser asks the same question as the service from data loaded with the layout, so a
grant changed meanwhile shows a control that fails, or hides one that would work, until the next load.

**BD6. The selection lives as long as the tab, across directories and buckets (BRW-5, BRW-9).**
*Why:* moving is select, navigate, move here; a selection reset on every navigation would make a move
across directories impossible.
*Cost:* a selection can hold items the current page does not show, and a delete deletes them too.
The confirmation counts them, but does not name them.

**BD7. A picker selects files only (BRW-12).** The browser forbids directories in picker mode,
whatever the opener asked.
*Why:* a file field holds objects, and a directory is not one.
*Cost:* no field can reference a directory.

**BD8. A directory's levels are joined in the URL with a delimiter, not with `/` (BRW-2).** The
delimiter is `storage.pathDelimiter`, `|->` by default, and each level keeps its trailing `/`.
*Why:* Cloud Storage accepts `/` inside a level: `a//b` is the object `b` in a directory with an
empty name inside `a/`. With `/` between levels, the path `a//b` could not tell that directory from
`a/` itself, and the router drops empty segments. A delimiter that names do not use keeps every level,
the empty one included.
*Cost:* a level whose name contains the delimiter cannot be opened (BF7), and the URLs look unusual.

### Findings

| # | Finding | State |
| :-- | :-- | :-- |
| BF1 | **A user who may write or delete in the default bucket can replace or remove the CMS's own state.** The browser lists `.genoacms/` like any other directory (BRW-3), uploads replace an object of the same name without asking (BRW-6), and rename, move and delete act on it too. That state includes sessions, the authorization manifests, the key registry, the security policy and published pages. Signed state that is replaced fails its verification; unsigned state is taken as written. Found 2026-10-18 by reading at `de04f62`. | open; decided by BU1 (STS-5, no RFC yet) |
| BF2 | **Names from the request are joined with Node's `path.join` (BRW-6 to BRW-8).** A file name, directory name or new name containing `..` resolves out of the current directory, within the same bucket; one containing `/` makes nested directories. An empty directory name sent without the form, in a subdirectory, creates `<prefix>/.folderPlaceholder` under a name ending in `/` (`contracts/storage.md` CF48); at the root, `path.join` turns it into `.`. Found 2026-10-18 by reading. | open |
| BF3 | **Renaming a directory renames every directory that starts with its name (BRW-8).** The form sends the directory's name without its trailing `/`, so `moveDirectory` gets the prefix `photos/2024`: renaming it to `2025` also moves `photos/2024-old/x` to `photos/2025-old/x`, and any object whose name starts with `photos/2024`. Found 2026-10-18 by reading; not run. | open |
| BF4 | **Moving into the directory an item is already in is not skipped (BRW-9).** The action compares the raw route parameter, which holds the delimiter, with the item's parent as `photos`, without its `/`; they never match, so every selected item is moved onto its own name, or a directory into itself. What each adapter does with a move onto the same name was not run. Found 2026-10-18 by reading. | open |
| BF5 | **The `contents` field of move and delete is parsed without a check (BRW-9, BRW-10).** A value that is not JSON fails the action with a 500, not `fail(400)`, and its entries are not checked to be references. Found 2026-10-18 by reading. | open |
| BF6 | **A denied operation is a server error (STS-2).** The routes do not map `PermissionDeniedError` to 403, as `authorization/enforce.ts` expects of them, and core has no `handleError`: a denied listing shows SvelteKit's 500 page, and a denied action shows the action's generic failure toast. Found 2026-10-18 by reading. | open |
| BF7 | **A directory whose name contains the path delimiter cannot be opened (BRW-2).** The delimiter, `|->` by default, is removed everywhere in the route parameter, not only between levels. Found 2026-10-18 by reading. | open |
| BF8 | **Only the first page of a directory is listed (BRW-3).** The browser passes no `limit` or `startAfter`, and a directory of more than 1000 entries shows the first 1000 with no sign that more exist (`contracts/storage.md` CF46, `collections.md` OF24). | open |
| BF9 | **Several items are acted on at once, and a failure hides what succeeded (BRW-6, BRW-9, BRW-10).** Uploads, moves and deletes of several items start together; the first failure fails the action, the others go on, and the user sees only `Upload failed`, `Move failed` or `Deletion failed`, with the selection kept. Found 2026-10-18 by reading. | open |
| BF10 | **The picker's confirm button is named `Select all` (BRW-12).** It sends the selection and closes the tab; the button that selects everything has the same name. Found 2026-10-18 by reading. | open |

### History

*History.* The storage browser dates from 2024-01 (`4303719`). On 2026-08-17 (`77161e0`) the
user layer was split from the storage service to enforce bucket permissions on user operations
(BD1); `storage:bucket:list` was later removed as redundant (BD3). The selection and the picker's half of the protocol were shared with the collection listing
in 2026-10 (`collections.md` OD11). Until 2026-10-18 nothing but the code described either.

### Verification

No test carries an `STS` or `BRW` ID yet, so every statement is `unverified`. Tests that check
statements without carrying their IDs:

- `packages/core/src/lib/script/storage/user.server.test.ts` (unit): STS-1 to STS-3, on the user layer
  with the storage service stubbed: each permission allows its operations and denies the others,
  grants do not carry between buckets, write does not imply read, and the bucket list.
- `packages/core/e2e/collections.test.ts` (e2e): the browser in picker mode, through PCK-2 and PCK-4:
  opening a bucket, selecting files up to `maxItems` and confirming. It touches BRW-1, BRW-5 and
  BRW-12.
- `packages/core/src/lib/script/selection/Selection.test.ts` (unit): the shared selection behind
  BRW-5 and BRW-12.

The browser's own screens, upload, rename, move and delete have no test. This document was written on
2026-10-18 from the code at `de04f62`; the findings were found by reading it, and none was run.

## Specification

### The user layer

#### STS-1 · The buckets a principal sees

The bucket list holds each bucket of the configuration, in its order, on which the principal holds
any `storage:bucket:*` grant (BD3).

- Test: unverified
- Level: unit

#### STS-2 · A permission per operation

Each operation a user performs checks one permission on the reference's bucket before the adapter is
called:

| Operation | Permission |
| :-- | :-- |
| listing a directory, and signing its files' URLs (STS-4) | `storage:bucket:read` |
| uploading an object, creating a directory, moving or renaming an object or a directory | `storage:bucket:write` |
| deleting an object or a directory | `storage:bucket:delete` |

A principal without it gets `PermissionDeniedError`, message
`permission-denied: '<subject>' lacks <permission> on '<bucket>'`, and the adapter is not called.

- Test: unverified
- Level: unit, e2e

#### STS-3 · Grants do not carry

A grant on one bucket allows nothing on another, and no permission implies another: write allows
neither reading nor deleting, and delete allows no move.

- Test: unverified
- Level: unit

#### STS-4 · A listing carries signed URLs

A directory's listing, as the browser receives it, gives each file its full `name`, `size`,
`lastModified`, its `filename` (the name after its last `/`), and a `signedURL` (`contracts/storage.md`
STOR-9) that expires one hour after the listing. Directories are `{ bucket, name }`, as the adapter
lists them.

- Test: unverified
- Level: unit

#### STS-5 · The CMS's state is read-only for users

In the default bucket, the user layer refuses an upload, a directory creation, a move, a rename or a
delete when its name or its destination starts with `.genoacms/`, or when the operation acts on a
prefix that `.genoacms/` starts with, such as `` or `.gen`. It throws an `Error` with the message
`storage/internal-read-only: <name>`, and the adapter is not called. Listing and signing URLs under
`.genoacms/` follow STS-2. Other buckets, and names elsewhere in the default bucket, are not affected,
and neither is the CMS's own access (BD1).

- Test: none yet
- Level: unit, e2e
- State: new (no RFC yet)

### The browser

#### BRW-1 · Pages

| Path | Shows |
| :-- | :-- |
| `/storage` | the buckets of STS-1, titled `Buckets`, each a link to its root |
| `/storage/<bucket>` | redirects, 307, to `/storage/<bucket>/contents` |
| `/storage/<bucket>/<path>/contents` | the directory `<path>` (BRW-2) |

Every link to a bucket or a directory keeps the page's query string, so a picker's `selectionId`
follows the user into buckets and directories. The back control does not keep it.

- Test: unverified
- Level: e2e

#### BRW-2 · A directory in the path

The configuration's `storage.pathDelimiter`, `|->` by default, separates the levels of `<path>`, and
each level carries its trailing `/`: the directory `photos/2024/` is
`/storage/<bucket>/|->photos/|->2024//contents`, and the root is `/storage/<bucket>/contents`. The
directory's name is `<path>` with every occurrence of the delimiter removed. The back control leads
to the parent directory, and from the root to `/storage`.

- Test: unverified
- Level: e2e

#### BRW-3 · A directory

The page is titled with the directory's name, and shows its directories, then its files, in the order
the adapter lists them (`contracts/storage.md` STOR-11). A directory shows its own level's name, its
trailing `/` removed, and opens it. A file shows its `filename` and opens its signed URL in a new tab.

- Test: unverified
- Level: e2e

#### BRW-4 · The toolbar

From left to right: move here (BRW-9) and delete (BRW-10), each shown only when the selection is not
empty; the selection control (BRW-5); create directory (BRW-7) and upload (BRW-6). Move, create
directory and upload are shown only to a principal holding `storage:bucket:write` on the bucket,
delete only to one holding `storage:bucket:delete`. Each file and directory has a context menu whose
`Rename` (BRW-8) is shown on the same terms as move. What is shown decides nothing (BD5).

- Test: unverified
- Level: e2e

#### BRW-5 · Selecting

Each file and directory has a checkbox, named `select-<name>`. The selection control reads
`Select all` when the selection is empty, and adds every file and directory of the directory shown;
otherwise it reads `Unselect all` and empties the selection. The selection holds references, keeps
the order of selecting, and lasts until the tab closes or a move or delete succeeds, across
directories and buckets (BD6).

- Test: unverified
- Level: unit, e2e

#### BRW-6 · Uploading

`Upload object` opens `Upload files`, with a file input taking several files. Each file is written,
without a condition, to the directory's name followed by the file's name; existing objects of those
names are replaced. While it runs the browser shows `Uploading`; then `Upload successful` and the
directory reloads, or `Upload failed`. A submission without files does nothing.

- Test: unverified
- Level: e2e

#### BRW-7 · Creating a directory

`Create directory` opens a dialog of that title, with a required `Directory name:`. The directory
created is the directory's name followed by the name given (`contracts/storage.md` STOR-12). The
browser shows `Creating`, then `Directory created` and reloads, or `Failed to create directory`.

- Test: unverified
- Level: e2e

#### BRW-8 · Renaming

`Rename` opens `Rename` with `New name:`, filled with the current name. The item keeps its directory
and takes the new name: a file by `moveObject`, a directory, with every object under it, by
`moveDirectory` (`contracts/storage.md` STOR-10, STOR-14). The browser shows `Renaming`, then
`Renamed` and reloads, or `Renaming failed` with the dialog open again.

- Test: unverified
- Level: e2e

#### BRW-9 · Moving here

Move here moves each selected item of the bucket shown into the directory shown, under its own last
level's name; an item already in that directory, and an item of another bucket, are left where they
are. The browser shows `Moving`, then `Moved`, empties the selection and reloads, or `Move failed`.

- Test: unverified
- Level: e2e

#### BRW-10 · Deleting

Delete asks `Do you want to delete <directories> and <files>?`, where each part reads `one
directory` or `<n> directories`, `one file` or `<n> files`, and is left out, with the `and`, when its
count is 0. It counts every selected item (BD6), a name ending in `/` as a directory. On confirmation
it deletes each item, a directory with everything under it, and shows `Deleting`, then `Deleted`,
empties the selection and reloads, or `Deletion failed`. Cancelling deletes nothing.

- Test: unverified
- Level: e2e

#### BRW-11 · Malformed submissions

A form action missing a field fails with status 400 and a `reason`, without calling the user layer:

| Action | Missing | `reason` |
| :-- | :-- | :-- |
| create directory | `directoryName` | `missing-directory-name` |
| move | `contents` | `missing-file-name` |
| rename | `name`, `newName` | `missing-name`, `missing-new-name` |
| delete | `contents` | `missing-contents` |

- Test: unverified
- Level: unit

#### BRW-12 · The browser as a picker

Opened with `?selectionId=<id>`, the browser joins the picker protocol of `collections.md` PCK-2 on
that channel: it takes `maxItems` and the current value from the opener, shows no checkbox on
directories (BD7), and selects nothing more once `maxItems` items are selected, while a selected
item can still be unselected. While the
selection is not empty, the selection control confirms: it sends the selection and closes the tab
once the opener acknowledges. Without `selectionId`, nothing of this is shown.

- Test: unverified
- Level: e2e
