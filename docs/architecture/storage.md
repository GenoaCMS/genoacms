---
type: architecture
title: Storage in core
prefix: B
codes: [STS, BRW]
verified: a878a518
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
| BU2 | 2026-10-18: a name a user types, a file's name on upload, a new directory's, a new name on rename, is one level: one that is empty, `.` or `..`, or contains `/` or the path delimiter, is refused, and names are appended to the directory as given, never through a path library (BF2). | BRW-13 |
| BU3 | 2026-10-18: a denied operation is a 403, not a 500: a listing shows a 403 page, an action fails with 403, and the browser keeps its generic failure messages (BF6). | BRW-16 |
| BU4 | 2026-10-18: an action on several items runs them one at a time, every one of them, and answers which failed; the selection keeps only the failed items (BF9). | BRW-14 |
| BU5 | 2026-10-18: a directory longer than one page shows its first page, and `Show more` loads the next into the same view (BF8). | BRW-15 |
| BU6 | 2026-10-28: a denial by the storage service itself, as against the CMS's own permission check (BU3), is a typed contract error, `StorageAccessDeniedError`, which each adapter raises for its provider's denial. Core answers it with 403 and a readable reason, and keeps the provider's detail (bucket, role, account) in the log, not on the page. An error no layer classifies shows its correlation ID, the one in the log line, instead of SvelteKit's bare `Internal Error` (BF11). Not yet specified: it needs an RFC, and a contract change in `contracts/storage.md`. | pending RFC |

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
The selection is kept in the tab's `sessionStorage`, so a reload keeps it too.
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
| BF1 | *History.* **A user who may write or delete in the default bucket can replace or remove the CMS's own state.** The browser lists `.genoacms/` like any other directory (BRW-3), uploads replace an object of the same name without asking (BRW-6), and rename, move and delete act on it too. That state includes sessions, the authorization manifests, the key registry, the security policy and published pages. Signed state that is replaced fails its verification; unsigned state is taken as written. Found 2026-10-18 by reading at `de04f62`. | fixed, RFC-0038 |
| BF2 | *History.* **Names from the request are joined with Node's `path.join` (BRW-6 to BRW-8).** A file name, directory name or new name containing `..` resolves out of the current directory, within the same bucket; one containing `/` makes nested directories. An empty directory name sent without the form, in a subdirectory, creates `<prefix>/.folderPlaceholder` under a name ending in `/` (`contracts/storage.md` CF48); at the root, `path.join` turns it into `.`. Found 2026-10-18 by reading. | fixed, RFC-0038 |
| BF3 | *History.* **Renaming a directory renames every directory that starts with its name (BRW-8).** The form sends the directory's name without its trailing `/`, so `moveDirectory` gets the prefix `photos/2024`: renaming it to `2025` also moves `photos/2024-old/x` to `photos/2025-old/x`, and any object whose name starts with `photos/2024`. Found 2026-10-18 by reading; not run. | fixed, RFC-0038 |
| BF4 | *History.* **Moving into the directory an item is already in is not skipped (BRW-9).** The action compares the raw route parameter, which holds the delimiter, with the item's parent as `photos`, without its `/`; they never match, so every selected item is moved onto its own name, or a directory into itself. What each adapter does with a move onto the same name was not run. Found 2026-10-18 by reading. | fixed, RFC-0038 |
| BF5 | *History.* **The `contents` field of move and delete is parsed without a check (BRW-9, BRW-10).** A value that is not JSON fails the action with a 500, not `fail(400)`, and its entries are not checked to be references. Found 2026-10-18 by reading. | fixed, RFC-0038 |
| BF6 | *History.* **A denied operation is a server error (STS-2).** The routes do not map `PermissionDeniedError` to 403, as `authorization/enforce.ts` expects of them, and core has no `handleError`: a denied listing shows SvelteKit's 500 page, and a denied action shows the action's generic failure toast. Found 2026-10-18 by reading. | fixed, RFC-0038 |
| BF7 | **A directory whose name contains the path delimiter cannot be opened (BRW-2).** The delimiter, `|->` by default, is removed everywhere in the route parameter, not only between levels. Found 2026-10-18 by reading. | open; mitigated by BU2, which refuses the delimiter in new names; names written outside the browser still cannot be opened |
| BF8 | *History.* **Only the first page of a directory is listed (BRW-3).** The browser passes no `limit` or `startAfter`, and a directory of more than 1000 entries shows the first 1000 with no sign that more exist (`contracts/storage.md` CF46, `collections.md` OF24). | fixed, RFC-0038 |
| BF9 | *History.* **Several items are acted on at once, and a failure hides what succeeded (BRW-6, BRW-9, BRW-10).** Uploads, moves and deletes of several items start together; the first failure fails the action, the others go on, and the user sees only `Upload failed`, `Move failed` or `Deletion failed`, with the selection kept. Found 2026-10-18 by reading. | fixed, RFC-0038 |
| BF10 | *History.* **The picker's confirm button is named `Select all` (BRW-12).** It sends the selection and closes the tab; the button that selects everything has the same name. Found 2026-10-18 by reading. | fixed, RFC-0038 |
| BF11 | **A denial by the storage service is an unexplained server error (BRW-3, BRW-16).** BU3 and RFC-0038 map only core's own `PermissionDeniedError` to 403. What a provider refuses, the adapter lets escape as its raw error: core has no `handleError` and no `+error.svelte`, so opening a directory the service account may not list shows SvelteKit's `Internal Error` page, and only the server log names the cause. The contract has no error for it. Found 2026-10-28 in use, on a directory of about 2000 objects, first suspected to be load; the log showed a permission error. Which adapter and the provider's exact error are not recorded. | open; decided in BU6, awaiting an RFC |
| BF12 | *History.* **Text the CMS reads from an object is corrupted when a multibyte character spans two chunks (STS-6).** The storage service, the session store and the authorization manifests read an object as text by turning each chunk of its stream into a string on its own and joining the strings. The two halves of a UTF-8 character split across chunks each become U+FFFD. Whether it happens depends on how the provider chunks the stream, not on the content alone: the memory storage of the unit tests yields one chunk and never shows it. A page edit reads its entry, changes it and writes it back, so the damage is written into the entry and grows with each save. Found 2026-10-28 in use, on core 0.3.0 on Cloud Storage: a Slovak page built with about 280 MCP edits stored 2,731 U+FFFD characters, `Návod na používanie aplikácie` having become `Návod na pou��ívanie aplik��������cie`. The MCP client sent correct UTF-8. | fixed, RFC-0040 |

### History

*History.* The storage browser dates from 2024-01 (`4303719`). On 2026-08-17 (`77161e0`) the
user layer was split from the storage service to enforce bucket permissions on user operations
(BD1); `storage:bucket:list` was later removed as redundant (BD3). The selection and the picker's half of the protocol were shared with the collection listing
in 2026-10 (`collections.md` OD11). Until 2026-10-18 nothing but the code described either. RFC-0038
(2026-10-18) made `.genoacms/` read-only for users, took typed names as one level, fixed renames and
moves, answered denials with 403, reported bulk actions per item, and paged the directory view.
RFC-0040 (2026-10-28) decoded objects the CMS reads as text whole, after a split character had
damaged a page in use (BF12), and specified it (STS-6).

### Verification

Every statement names the tests that carry its ID (RFC-0038):

- **`unit`, in Node:** the user layer with the storage service stubbed, and, for STS-4, with only
  the adapter stubbed; the route's actions with the user layer real (`actions.test.ts`); the pure path,
  name and message modules; the permission matrix (`packages/core/evidence/`), which covers the two
  new checks.
- **`unit`, in Chromium:** the shared selection behind BRW-5 and BRW-12.
- **`e2e`:** `packages/core/e2e/storage.test.ts` serves core built with `genoa.config/e2e.ts`, with an
  administrator, a principal who reads `test`, and `e2e-dan`, who may only read the bucket. Fixtures
  are written under `e2e-<run>/` through the GCP adapter and removed afterwards. A partial failure
  (BRW-14) is shown by answering the action in the browser, not by a failing adapter.

*History.* This document was written on 2026-10-18 from the code at `de04f62`; its findings were found
by reading it, and RFC-0038 fixed them (BF7 mitigated).

**BS1.** STS-6 is checked in unit tests over an adapter that splits every object into 3-byte chunks:
the storage service, a manifest and twenty MCP page edits, and `streamToString` itself, under any split
(property-based). No test reads a large non-ASCII object through a real provider's stream. A falsification audit on 2026-10-28, by an agent that did not write the code, found no counterexample. It found the session store unpinned, its own tests stubbing the decoding; a session-family test now covers it. Not stated, and not tested: chunk types other than strings and byte arrays, which `Buffer.concat` refuses; a stream closed without an error, which fails the read with `ERR_STREAM_PREMATURE_CLOSE`; a stream that never ends, which never answers; and a size limit.

## Specification

### The user layer

#### STS-1 · The buckets a principal sees

The bucket list holds each bucket of the configuration, in its order, on which the principal holds
any `storage:bucket:*` grant (BD3).

- Test: `packages/core/e2e/storage.test.ts`, `packages/core/src/lib/script/storage/user.server.test.ts`
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

- Test: `packages/core/e2e/storage.test.ts`, `packages/core/src/lib/script/storage/user.server.test.ts`
- Level: unit, e2e

#### STS-3 · Grants do not carry

A grant on one bucket allows nothing on another, and no permission implies another: write allows
neither reading nor deleting, and delete allows no move.

- Test: `packages/core/src/lib/script/storage/user.server.test.ts`
- Level: unit

#### STS-4 · A listing carries signed URLs

A directory's listing, as the browser receives it, gives each file its full `name`, `size`,
`lastModified`, its `filename` (the name after its last `/`), and a `signedURL` (`contracts/storage.md`
STOR-9) that expires one hour after the listing. Directories are `{ bucket, name }`, as the adapter
lists them. The listing is one page of the adapter's (`contracts/storage.md` STOR-11), and carries
its `next`; the next page is listed with `pageToken: next`.

- Test: `packages/core/src/lib/script/storage/user.server.test.ts`
- Level: unit

#### STS-5 · The CMS's state is read-only for users

In the default bucket, the user layer refuses an upload, a directory creation, a move, a rename or a
delete when its name or its destination starts with `.genoacms/`, or when it acts on a directory
that `.genoacms/` lies under, the root `` among them. It throws an `Error` with the message
`storage/internal-read-only: <name>`, naming the source when it is refused and the destination
otherwise, after the permission check (STS-2), and the adapter is not called. Listing and signing
URLs under `.genoacms/` follow STS-2. Other buckets, and names elsewhere in the default bucket, are
not affected, and neither is the CMS's own access (BD1).

- Test: `packages/core/e2e/storage.test.ts`, `packages/core/src/lib/script/storage/user.server.test.ts`
- Level: unit, e2e

### The CMS's own reads

#### STS-6 · Objects read as text are decoded whole

When the CMS reads an object as text, it decodes the object's bytes as one UTF-8 sequence, never chunk
by chunk. This holds for every text read of the storage service (BD1), the internal documents it reads
as text, JSON or flatted, page entries among them, and for the session store and the authorization
manifests. The text is the same however the adapter splits the object's stream into chunks, a split
inside a multibyte character included; a chunk that is a string counts as its UTF-8 bytes. Bytes that
are not valid UTF-8 decode to U+FFFD, and a leading byte order mark is kept as U+FEFF. A stream that
fails fails the read with the stream's error.

- Test: `packages/core/src/lib/script/utils.server.test.ts`, `packages/core/src/lib/script/storage/storage.server.test.ts`
- Level: unit

### The browser

#### BRW-1 · Pages

| Path | Shows |
| :-- | :-- |
| `/storage` | the buckets of STS-1, titled `Buckets`, each a link to its root |
| `/storage/<bucket>` | redirects, 307, to `/storage/<bucket>/contents` |
| `/storage/<bucket>/<path>/contents` | the directory `<path>` (BRW-2) |

Every link to a bucket or a directory keeps the page's query string, so a picker's `selectionId`
follows the user into buckets and directories. The back control does not keep it.

- Test: `packages/core/e2e/storage.test.ts`
- Level: e2e

#### BRW-2 · A directory in the path

The configuration's `storage.pathDelimiter`, `|->` by default, separates the levels of `<path>`, and
each level carries its trailing `/`: the directory `photos/2024/` is
`/storage/<bucket>/|->photos/|->2024//contents`, and the root is `/storage/<bucket>/contents`. The
directory's name is `<path>` with every occurrence of the delimiter removed. The back control leads
to the parent directory, and from the root to `/storage`.

- Test: `packages/core/e2e/storage.test.ts`, `packages/core/src/lib/script/storage/browserPaths.test.ts`
- Level: e2e

#### BRW-3 · A directory

The page is titled with the directory's name, and shows the directories loaded, then the files
loaded (BRW-15), each in the order the adapter lists them (`contracts/storage.md` STOR-11). A
directory shows its own level's name, its trailing `/` removed, and opens it. A file shows its
`filename` and opens its signed URL in a new tab.

- Test: `packages/core/e2e/storage.test.ts`
- Level: e2e

#### BRW-4 · The toolbar

From left to right: move here (BRW-9) and delete (BRW-10), each shown only when the selection is not
empty; the selection control (BRW-5); create directory (BRW-7) and upload (BRW-6). Move, create
directory and upload are shown only to a principal holding `storage:bucket:write` on the bucket,
delete only to one holding `storage:bucket:delete`. Each file and directory has a context menu whose
`Rename` (BRW-8) is shown on the same terms as move. What is shown decides nothing (BD5).

- Test: `packages/core/e2e/storage.test.ts`
- Level: e2e

#### BRW-5 · Selecting

Each file and directory has a checkbox, named `select-<name>`. The selection control reads
`Select all` when the selection is empty, and adds every file and directory of the directory shown;
otherwise it reads `Unselect all` and empties the selection. The selection holds references, keeps
the order of selecting, and lasts until the tab closes or a move or delete succeeds, across
directories and buckets (BD6).

- Test: `packages/core/e2e/storage.test.ts`, `packages/core/src/lib/script/selection/Selection.test.ts`
- Level: unit, e2e

#### BRW-6 · Uploading

`Upload object` opens `Upload files`, with a file input taking several files. Each file is written,
without a condition, to the directory's name followed by the file's name (BRW-13); an existing
object of that name is replaced. While it runs the browser shows `Uploading`; then `Upload
successful` and the directory reloads, or a failure as BRW-14 and BRW-16 say. A submission without
files does nothing.

- Test: `packages/core/e2e/storage.test.ts`
- Level: e2e

#### BRW-7 · Creating a directory

`Create directory` opens a dialog of that title, with a required `Directory name:`. The directory
created is the directory's name followed by the name given and `/` (BRW-13; `contracts/storage.md`
STOR-12). The browser shows `Creating`, then `Directory created` and reloads, or `Failed to create
directory`.

- Test: `packages/core/e2e/storage.test.ts`, `packages/core/src/routes/(admin)/storage/[bucketId]/[...path]/contents/actions.test.ts`
- Level: e2e

#### BRW-8 · Renaming

`Rename` opens `Rename` with `New name:`, filled with the current name. The item keeps its directory
and takes the new name (BRW-13): a file `<directory><name>` moves to `<directory><newName>` by
`moveObject`; a directory `<directory><name>/` moves, with every object under it, to
`<directory><newName>/` by `moveDirectory`, and nothing outside it moves. The browser shows
`Renaming`, then `Renamed` and reloads, or `Renaming failed` with the dialog open again.

- Test: `packages/core/e2e/storage.test.ts`, `packages/core/src/routes/(admin)/storage/[bucketId]/[...path]/contents/actions.test.ts`
- Level: e2e

#### BRW-9 · Moving here

Move here moves each selected item of the bucket shown into the directory shown, under its own last
level's name. An item whose parent is the directory shown, and an item of another bucket, are left
where they are and are not counted. A directory moved into itself or below itself fails, as an item
(BRW-14). The browser shows `Moving`, then `Moved`, empties the selection and reloads, or a failure
as BRW-14 and BRW-16 say.

- Test: `packages/core/e2e/storage.test.ts`, `packages/core/src/routes/(admin)/storage/[bucketId]/[...path]/contents/actions.test.ts`
- Level: e2e

#### BRW-10 · Deleting

Delete asks `Do you want to delete <directories> and <files>?`, where each part reads `one
directory` or `<n> directories`, `one file` or `<n> files`, and is left out, with the `and`, when its
count is 0. It counts every selected item (BD6), a name ending in `/` as a directory. On confirmation
it deletes each item, a directory with everything under it, and shows `Deleting`, then `Deleted`,
empties the selection and reloads, or a failure as BRW-14 and BRW-16 say. Cancelling deletes
nothing.

- Test: `packages/core/e2e/storage.test.ts`
- Level: e2e

#### BRW-11 · Malformed submissions

A form action with a missing or malformed field fails with status 400 and a `reason`, without
calling the user layer:

| Action | Missing or invalid | `reason` |
| :-- | :-- | :-- |
| create directory | `directoryName` missing | `missing-directory-name` |
| move | `contents` missing | `missing-file-name` |
| rename | `name`, `newName` missing | `missing-name`, `missing-new-name` |
| delete | `contents` missing | `missing-contents` |
| move, delete | `contents` that is not a JSON array of objects with a string `bucket` and a string `name`, or an empty array | `invalid-contents` |
| upload, create directory, rename | a name BRW-13 refuses | `invalid-name` |

- Test: `packages/core/src/lib/script/storage/browserPaths.test.ts`, `packages/core/src/routes/(admin)/storage/[bucketId]/[...path]/contents/actions.test.ts`
- Level: unit

#### BRW-12 · The browser as a picker

Opened with `?selectionId=<id>`, the browser joins the picker protocol of `collections.md` PCK-2 on
that channel: it takes `maxItems` and the current value from the opener, shows no checkbox on
directories (BD7), and selects nothing more once `maxItems` items are selected, while a selected
item can still be unselected. While the selection is not empty, the selection control is a button
named `Confirm selection`, which sends the selection and closes the tab once the opener
acknowledges. Without `selectionId`, nothing of this is shown.

- Test: `packages/core/e2e/storage.test.ts`, `packages/core/src/lib/script/selection/Selection.test.ts`
- Level: e2e

#### BRW-13 · Names a user types

A file's name on upload, a new directory's name and a new name on rename are each one level. A name
that is empty, is `.` or `..`, or contains `/` or the path delimiter (BRW-2) is refused: the action
fails with 400 and the reason `invalid-name`, and nothing is written. An accepted name is appended
to the directory's name as given, without normalization: a new directory `<name>` in `photos/` is
`photos/<name>/`.

- Test: `packages/core/e2e/storage.test.ts`, `packages/core/src/lib/script/storage/browserPaths.test.ts`, `packages/core/src/routes/(admin)/storage/[bucketId]/[...path]/contents/actions.test.ts`
- Level: unit, e2e

#### BRW-14 · Acting on several items

Uploading several files, moving several items and deleting several items act on them one at a time,
in the order given, and go on after a failure. When every item succeeds, the browser shows the
action's success message (BRW-6, BRW-9, BRW-10). Otherwise the action fails with status 500 and
`{ done, failed }`: the number of items that succeeded, and the names of those that failed. The
browser then shows `<done> of <n> <past participle>. Failed: <names>`, with `uploaded`, `moved` or
`deleted`, the names joined by `, `, and keeps only the failed items selected. A request that the
user layer refuses as a whole (BRW-16) acts on no item.

- Test: `packages/core/e2e/storage.test.ts`, `packages/core/src/lib/script/storage/bulkResult.test.ts`, `packages/core/src/routes/(admin)/storage/[bucketId]/[...path]/contents/actions.test.ts`
- Level: unit, e2e

#### BRW-15 · Showing more

A directory shows the first page of its listing (`contracts/storage.md` STOR-11). While the listing
has a next page, a button `Show more` below the entries loads it and appends its directories and
files to those shown. Select all (BRW-5) selects what is shown.

- Test: `packages/core/e2e/storage.test.ts`
- Level: e2e

#### BRW-16 · Denials

A listing the principal may not read answers 403. An action that the user layer refuses, for a
missing permission (STS-2) or for `.genoacms/` (STS-5), fails with 403 and the reason
`permission-denied` or `internal-read-only`, and acts on nothing: an action on several items checks
every item before acting on any. The browser shows the action's failure message, as for any failure.

- Test: `packages/core/e2e/storage.test.ts`, `packages/core/src/routes/(admin)/storage/[bucketId]/[...path]/contents/actions.test.ts`
- Level: unit, e2e

