---
type: rfc
number: 37
title: The storage contract, its suite, and adapters that conform
status: implemented
commits: [813d2b5]
depends: []
architecture: [architecture/contracts/storage.md, architecture/contracts/conformance.md, architecture/adapter-gcp/storage.md, architecture/adapter-aws/storage.md, architecture/adapter-minio.md, architecture/collections.md, architecture/cli.md]
changes: [STOR-1 breaking, STOR-3 breaking, STOR-7 breaking, STOR-11 breaking, STOR-12 breaking, STOR-15 compatible, STO-3 breaking, STO-4 breaking, STO-6 breaking, STO-7 breaking, STO-9 breaking, STO-10 breaking, OBJ-2 breaking, OBJ-3 breaking, OBJ-7 breaking, OBJ-8 breaking, OBJ-9 breaking, COL-1 compatible, COL-2 breaking, CLI-10 compatible]
commit-subject: "feat(storage): not-found, directory names, paged listings and a full conformance suite; MinIO conforms (RFC-0037)"
---

# RFC-0037: The storage contract, its suite, and adapters that conform

## Summary

The storage contract was first specified on 2026-10-18 (`contracts/storage.md`), from the types and
the adapters. Writing it down showed where the adapters disagree, where the contract is silent, and
that its conformance suite checks too little to notice either (CF44 to CF50). The author decided
CU5 to CU10 the same day. This RFC:

1. Adds `ObjectNotFoundError`: `getObject` and `deleteObject` of a missing object reject with it on
   every adapter (STOR-16; CU5, CU8; CF44, CF45). Core then tells a missing collection definition from
   an outage (COL-2; `collections.md` OF29).
2. Fixes the form of a directory's name: `''` or ending in `/`, refused otherwise, and
   an empty directory is kept however the adapter's store needs, with no placeholder required by
   the contract (STOR-3, STOR-12; CU9; CD10; CF48, `collections.md` OF23).
3. Pages listings with an opaque token, `pageToken` in, `next` out (STOR-1, STOR-11; CU10; CF46).
   Core's internal listings and `genoa database` follow every page (COL-1, CLI-10; OF24).
4. Removes `gzip` from `UploadOptions` (STOR-1, STOR-7; CU7; CF47).
5. Brings `@genoacms/adapter-minio` to the contract, as an adapter for any S3-compatible server that
   honors conditional writes, tested against RustFS (MIO-3 to MIO-13; CU6, MU2; CF49, MF1).
6. Grows the storage suite to every statement it can check, with its own mutants, on names unique to
   the run (CONF-2; CF9, CF50, CD5, CD6), and makes the in-memory adapter conform.

The storage browser's use of paging, and every other change to core's user-facing storage, are
RFC-0038.

## Files

**Modify or create only:**

| File | Change |
| :-- | :-- |
| `packages/contracts/src/storage/types.d.ts` | `UploadOptions` without `gzip`; `pageToken`, `next` |
| `packages/contracts/src/storage/index.js`, `index.d.ts` | `ObjectNotFoundError`, `isNotFound`, `NotADirectoryError`, `isDirectoryName` |
| `packages/contracts/src/storage.test.js` | the contract's unit tests of §Tests |
| `packages/contracts/src/storage/types.test-d.ts` | new: STOR-1's type tests |
| `packages/conformance/src/storage.js` | the suite of CONF-2 |
| `packages/conformance/src/index.d.ts` | `runStorageConformance`'s signature, unchanged in shape |
| `packages/conformance/test/memory.js` | `memoryStorage` conforms to STOR-1 to STOR-16 |
| `packages/conformance/test/mutants/storage.js` | new: one mutant of `memoryStorage` per suite test |
| `packages/conformance/test/mutants/storage.mutant.js` | new: runs the suite against the mutant named by `GENOACMS_MUTANT` |
| `packages/conformance/test/storage.test.js` | the suite against `memoryStorage`, and the mutant test |
| `packages/conformance/README.md` | the storage suite's fixture and what it checks |
| `packages/adapter-gcp/src/storage/runtime.ts` | STO-3, STO-4, STO-6, STO-7, STO-9, STO-10 |
| `packages/adapter-gcp/src/storage/runtime.test.ts` | the unit tests of §Tests |
| `packages/adapter-gcp/test/contract/storage.test.ts` | STO-4's missing read; STO-9's paging; STOR-9 in STO-8's title |
| `packages/adapter-gcp/test/conformance.test.ts` | the suite's wrapper loses `STO-4:` (CD4), at step 9 with STO-4's `Test:` line |
| `packages/adapter-aws/src/storage/runtime.ts` | OBJ-2, OBJ-3, OBJ-7, OBJ-8, OBJ-9 |
| `packages/adapter-aws/src/storage/runtime.test.ts` | the unit tests of §Tests |
| `packages/adapter-aws/test/contract/storage.test.ts` | OBJ-3's missing read, OBJ-7's missing delete, OBJ-8's paging; STOR-9 in OBJ-5's title |
| `packages/adapter-aws/test/conformance.test.ts` | the suite runs on the bare adapter, without `underPrefix`, which rewrites names and so the suite's messages, drops `next`, and passes `createDirectory('')` through; the suite writes under its own run directory (CD6). The wrapper loses `OBJ-3:` (CD4) at step 9 with OBJ-3's `Test:` line |
| `packages/adapter-minio/src/runtime.js`, `runtime.d.ts` | MIO-3 to MIO-13 |
| `packages/adapter-minio/src/runtime.test.js` | the unit tests of §Tests |
| `packages/core/src/lib/script/storage/storage.server.ts` | `listWholeDirectory`; `listOrCreateDirectory` uses it |
| `packages/core/src/lib/script/storage/providers.server.ts` | `listDirectory` passes `params` through |
| `packages/core/src/lib/script/database/database.server.ts` | COL-1 every page; COL-2 `isNotFound` |
| `packages/core/src/lib/script/database/database.server.test.ts` | the tests of §Tests |
| `packages/core/src/lib/script/components/editor/io.ts` | `deleteComponentDefinition` names a directory ending in `/` |
| `packages/core/src/lib/script/components/publication/io.server.ts` | the publications directory ends in `/`; the pointer is deleted with `deleteObject`; `isMissing` becomes `isNotFound` |
| `packages/core/src/routes/(admin)/storage/[bucketId]/[...path]/contents/+page.server.ts` | `createDirectory` and a directory's `rename` pass names ending in `/` |
| `packages/cli/src/database.js`, `database.test.js` | CLI-10 every page |
| `.github/workflows/ci.yml`, `scripts/test-level.mjs`, `packages/adapter-minio/test/conformance.test.js` | CI starts RustFS, pinned by digest; the conformance level runs the MinIO adapter's suite against it, which creates its bucket (`adapter-minio.md` MF2) |
| `.changeset/storage-contract-conformance.md` | new: `minor` for `@genoacms/adapter-gcp`, `@genoacms/adapter-aws`, `@genoacms/adapter-minio`, `@genoacms/core`; `patch` for `@genoacms/contracts`, `@genoacms/conformance`, `@genoacms/cli` |
| the architecture documents of `architecture` | to current, step 9 |

## Specification

### The contract (`contracts/storage.md`)

**STOR-1 · The types that cross the contract** (changed, breaking): `UploadOptions` loses `gzip`;
`DirectoryListingParams` gains `pageToken`; `DirectoryContents` gains `next`.

> ```ts
> interface UploadOptions {
>   ifVersion?: ObjectVersion
>   ifAbsent?: boolean
> }
>
> interface DirectoryListingParams {
>   startAfter?: string
>   limit?: number
>   pageToken?: string
> }
>
> interface DirectoryContents {
>   files: StorageObject[]
>   directories: ObjectReference[]
>   next?: string
> }
> ```
>
> The other types are as before.

**STOR-3 · Names are used as given** (changed, breaking): adds the second paragraph.

> An object's name is the whole key within its bucket. `/` separates directory levels: a directory is
> the prefix of the names under it, ending in `/`, and the bucket's root is the empty prefix `''`. An
> adapter neither normalizes nor resolves a name: `a//b`, `./a` and `a/../b` are names of their own.
> A store **MAY** refuse such a name; its error then propagates (STOR-15), and nothing is written
> under another name.
>
> A **directory name** is `''` or a name ending in `/`. `listDirectory`, `createDirectory`,
> `deleteDirectory` and `moveDirectory` take one, and `moveDirectory`'s destination is one; for any
> other name they throw `NotADirectoryError`, message `storage/not-a-directory: <bucket>/<name>`,
> after the bucket check (STOR-4) and before any request. `createDirectory`, `deleteDirectory` and
> `moveDirectory` refuse `''` likewise.

**STOR-7 · Writing an object** (changed, breaking): the sentence on `gzip` and its reference to CF47
are removed.

**STOR-11 · Listing one level** (changed, breaking): `pageToken` and `next`; `limit` and
`startAfter` restated.

> `listDirectory({ bucket, name }, { limit?, startAfter?, pageToken? })` lists the entries directly
> under the directory `name`, one level deep, from one request:
>
> - `files`: each object whose name starts with `name` and has no further `/` after it, except the
>   object named exactly `name` and any object the adapter wrote only to keep an empty directory
>   (STOR-12), with its `name`,
>   `size` (`0` when unknown) and `lastModified`;
> - `directories`: each prefix `name` + `<segment>/` under which at least one object exists, as
>   `{ bucket, name }`, its name ending in `/`;
> - `next`: present when the store has more entries after this page, absent when the listing is
>   complete. It is opaque, and only passed back as `pageToken`.
>
> With `pageToken`, the listing continues after the page that returned it; the other parameters are
> the same as for that page. Every page holds at most `limit` entries, files and directories
> together, or the store's own maximum without `limit`. Following `next` from the first page to the
> last lists each entry exactly once. With `startAfter`, only entries whose name sorts after it are
> listed, `startAfter` itself excluded.

**STOR-12 · Creating a directory** (changed, breaking):

> `createDirectory({ bucket, name })`, `name` a directory name other than `''` (STOR-3), writes the
> directory `name`: it is listed in its parent while it holds nothing else, and no listing shows
> anything it wrote as a file. How it is kept is the adapter's (CD10): the GCP and AWS adapters write
> `<name>.folderPlaceholder` (STO-10, OBJ-9), the MinIO adapter the empty object `<name>` (MIO-10).

**STOR-15 · Failures propagate** (changed, compatible): the exceptions are `bucket-unregistered`
(STOR-4), `NotADirectoryError` (STOR-3), `PreconditionFailedError` (STOR-7) and
`ObjectNotFoundError` (STOR-16).

**STOR-16 · A missing object** (added): as `contracts/storage.md` states it.

`@genoacms/contracts/storage` adds, in `index.js` and `index.d.ts`:

```ts
declare class ObjectNotFoundError extends Error {
  readonly name: 'ObjectNotFoundError'
  readonly reference: ObjectReference
  constructor (reference: ObjectReference)              // message: storage/not-found: <bucket>/<name>
}
declare function isNotFound (error: unknown): boolean   // name === 'ObjectNotFoundError'

declare class NotADirectoryError extends Error {
  readonly name: 'NotADirectoryError'
  readonly reference: ObjectReference
  constructor (reference: ObjectReference)              // message: storage/not-a-directory: <bucket>/<name>
}
declare function isDirectoryName (name: string): boolean   // name === '' || name.endsWith('/')
```

### The suite (`contracts/conformance.md`)

**CONF-2 · The storage suite** (added; it was **New** with no RFC):

> ```ts
> declare function runStorageConformance (adapter: StorageAdapter, fixture: { bucket: string }): void
> ```
>
> Against the fixture's bucket, under a directory `genoacms-conformance-<random>/` unique to the run,
> the suite checks STOR-2 to STOR-8 and STOR-10 to STOR-16 by examples, one test per behavior, each
> carrying the IDs it checks (CD4). It writes only under that directory and deletes it after the
> last test, also when a test failed. A bucket named `<fixture bucket>-unregistered` stands for one
> the provider was not given (STOR-4). The package's own tests run the suite against the in-memory
> adapter, and against one mutant of it per test, and expect exactly that test to fail (CD5).

The suite's tests are listed under §Tests. Each allows one minute.

### GCP (`adapter-gcp/storage.md`)

**STO-3 · Only registered buckets** (changed, breaking): adds "The directory methods then check the
name (`contracts/storage.md` STOR-3)."

**STO-4 · Reads return the generation** (changed, breaking):

> `getObject({ bucket, name })` reads the object's metadata, then returns `{ data, version }`: `data`
> is the object's read stream, and `version` its generation as a decimal string. When the metadata
> call fails with 404, it rejects with `ObjectNotFoundError`; when it fails otherwise, `version` is
> `undefined` and the read still proceeds.

**STO-6 · Conditional writes** (changed, breaking): "The remaining options pass to the client's
`save`." is removed; `save` receives only the precondition.

**STO-7 · Moving and deleting an object** (changed, breaking): adds "A delete answered with 404
rejects with `ObjectNotFoundError`."

**STO-9 · Listing one level** (changed, breaking):

> `listDirectory({ bucket, name }, { limit?, startAfter?, pageToken? })` makes one `getFiles` request:
> prefix `name`, delimiter `/`, `autoPaginate: false`, `maxResults: limit`, `startOffset:
> startAfter` and `pageToken`, each only when given. An object or prefix named exactly `startAfter`
> is left out, so a page **MAY** hold one entry fewer than `limit` (GF21). `files` excludes objects
> whose name ends in `.folderPlaceholder` and the object named exactly `name`. Each file has `name`,
> `size` (bytes, `0` when unknown) and `lastModified` (the object's `updated` time). `directories`
> are the returned prefixes other than `name`, as `{ bucket, name }` references. `next` is the
> response's next page token, when there is one. `limit: 0` lists nothing and sends no request.

**STO-10 · Creating a directory** (changed, breaking): writes `<name>.folderPlaceholder`.

### AWS (`adapter-aws/storage.md`)

**OBJ-2 · Only registered buckets** (changed, breaking): adds "The directory methods then check the
name (`contracts/storage.md` STOR-3)."

**OBJ-3 · Reading an object** (changed, breaking): "A missing object rejects with S3's `NoSuchKey`
error" becomes "S3's `NoSuchKey` rejects with `ObjectNotFoundError`"; the sentence comparing it with
GCP is removed.

**OBJ-7 · Moving and deleting an object** (changed, breaking):

> `moveObject(ref, newName)` sends `CopyObject` to `newName` in the same bucket, with `CopySource`
> `<bucket>/<encodeURIComponent(name)>`, then `DeleteObject` of the original; a failed copy deletes
> nothing. `deleteObject(ref)` sends `HeadObject` first: HTTP 404 rejects with `ObjectNotFoundError`
> and sends nothing more; otherwise it sends `DeleteObject`. Other errors propagate unchanged.

**OBJ-8 · Listing one level** (changed, breaking): adds `ContinuationToken: pageToken` to the
request, and "`next` is `NextContinuationToken` when the response `IsTruncated`".

**OBJ-9 · Creating a directory** (changed, breaking): writes `<name>.folderPlaceholder`.

### MinIO (`adapter-minio.md`)

MIO-3 to MIO-13 (added): as `adapter-minio.md` states them. `runtime.js` keeps `create(options,
ctx)`; the client is `new Minio.Client(...)` as today (MIO-2). Errors of the `minio` library carry
the S3 code in `code` and no HTTP status (`adapter-minio.md` MS1); MIO-4 and MIO-8 test
`code === 'NoSuchKey' || code === 'NotFound'`, and MIO-7 tests `code === 'PreconditionFailed'`, or
`code === 'NoSuchKey'` for an `ifVersion` write.

### Core and the CLI

**COL-1 · Where collections come from** (changed, compatible): "one per file in the directory" is
read over every page of the listing: "one per file in the directory `.genoacms/databases/<database>/collections/` of the default
bucket, following every page of its listing (`contracts/storage.md` STOR-11), …"; the rest is
unchanged.

**COL-2 · Resolving a definition** (changed, breaking): the third sentence becomes "When that file
does not exist (`contracts/storage.md` STOR-16) or does not parse, or the name is neither configured
nor dynamic, resolution fails with the error `collection/not-found`; any other failure to read it
propagates unchanged."

**CLI-10 · database** (changed, compatible): "lists the objects in
`.genoacms/databases/<database>/collections/`" becomes "lists the objects in
`.genoacms/databases/<database>/collections/`, following every page".

Core's storage service adds, beside `listDirectory`:

```ts
// every page, in order, concatenated; `next` is absent from the result
async function listWholeDirectory (reference: ObjectReference): Promise<DirectoryContents>
```

`listOrCreateDirectory` lists with it, and creates the directory with the name it was given, which
ends in `/`. `deleteComponentDefinition` deletes `<componentDefinitionPath><reference>/`.
`deleteComponentPublications` deletes the directory `<publicPath>/<uid>/` and the object
`publishedComponentPath(uid)` with `deleteObject`, each tolerating `isNotFound` in place of
`code === 404`; `deleteDirectory` of a directory that holds nothing resolves, as before.

The storage browser keeps working under STOR-3 until RFC-0038 replaces its actions: its
`createDirectory` action creates `<directory><name>/`, and `rename` of a directory moves
`<directory><name>/` to `<directory><newName>/`. This also stops a directory's rename from moving
its siblings (`storage.md` BF3); RFC-0038 adds its test. Nothing else of the browser changes here.

## Non-goals

- The storage browser's paging, names, denials and bulk actions: RFC-0038.
- The read-only `.genoacms/` (STS-5): RFC-0038.
- STOR-9 in the suite: a signed URL's bytes are fetched over the network, which the in-memory
  adapter cannot serve; the GCP and AWS contract tests check it.
- A not-found error for `moveObject` of a missing object. The contract does not say; GCP and AWS
  fail with their own errors.
- The database suite (CF7) and CONF-6 for any suite but storage.
- MinIO in CI (MF2).
- Migrating `.directoryPlaceholder` objects (`adapter-minio.md` MD4 hides them), or converting
  placeholders when a bucket moves between adapters (CD10).

## Tests

Each test of the suite is written once, in `packages/conformance/src/storage.js`, and runs at
`conformance` against the in-memory adapter and MinIO's opt-in run, and at `contract` in the GCP and
AWS conformance runs. Every path is under the run's directory `d = genoacms-conformance-<random>/`.

- `packages/conformance/src/storage.js` (conformance, contract):
  - › `STOR-2: the adapter has the ten methods`: given the adapter, then each of the ten names of
    STOR-2 is a function.
  - › `STOR-4: a bucket the provider was not given is refused`: when `getObject`, `uploadObject` and
    `listDirectory` are called on `<bucket>-unregistered`, then each rejects with the message
    `bucket-unregistered`.
  - › `STOR-5, STOR-7, STOR-11: an uploaded object is listed with its size and read back byte for byte`:
    given `d/a.txt` uploaded as the string `Storage adapter ✓` and `d/b.bin` as a 300-byte `Buffer`
    of every byte value, when `d/` is listed, then `files` holds both with sizes 19 and 300 and a
    `Date`, and `getObject` of each yields exactly the uploaded bytes; `uploadObject` resolved to
    `undefined`.
  - › `STOR-7: a stream is written whole`: given a `Readable` of three chunks, when uploaded, then
    `getObject` yields the three chunks' bytes.
  - › `STOR-5, STOR-6, STOR-7: a write on the version read succeeds, and the old version is refused`:
    given `d/v.txt` written and read with version `v1`, when it is written with `ifVersion: v1`,
    then that resolves, a read returns a version other than `v1`, and a second write with
    `ifVersion: v1` rejects with `isPreconditionFailed` true and the reason `object changed since it
    was read`, leaving the second content in place.
  - › `STOR-7, STOR-8: ifAbsent creates once, and refuses an existing object`: when `d/n.txt` is
    written with `ifAbsent: true` twice, then the first resolves, the second rejects with the message
    `storage/precondition-failed: <bucket>/d/n.txt: object already exists`, and the content is the
    first's; `ifAbsent` with a stale `ifVersion` on a missing object resolves.
  - › `STOR-7: a write without a condition replaces the object`: then the second content is read.
  - › `STOR-16: reading a missing object rejects with ObjectNotFoundError`: then `getObject` of
    `d/missing` rejects, before a stream is returned, with `isNotFound` true and the message
    `storage/not-found: <bucket>/d/missing`.
  - › `STOR-16: deleting a missing object rejects with ObjectNotFoundError`: as above, with
    `deleteObject`, and a later `listDirectory` of `d/` is unchanged.
  - › `STOR-10: a moved object is read under its new name and is gone from its old one`: then
    `getObject` of the new name yields the content, and of the old rejects with `isNotFound`;
    `deleteObject` of the new resolves to `undefined` and it is then missing.
  - › `STOR-3: the directory methods refuse a name that is not a directory name`: when
    `listDirectory`, `createDirectory`, `deleteDirectory` and `moveDirectory` are called with `d/x`,
    and `moveDirectory` from `d/x/` to `d/y`, and `createDirectory` with `''`, then each rejects with
    the message `storage/not-a-directory: <bucket>/<name>` of the offending name, and nothing was
    written.
  - › `STOR-3: names are not normalized`: when `d/a//b.txt`, `d/./c.txt` and `d/a/../e.txt` are each
    uploaded, then each either reads back under its own name or its upload was refused, and in both
    cases `d/a/b.txt`, `d/c.txt` and `d/e.txt` are missing (`adapter-minio.md` MF5).
  - › `STOR-11, STOR-12: a created directory is listed in its parent while empty, and shows no file`:
    when `createDirectory` of `d/e/`, then `d/` lists `{ bucket, name: 'd/e/' }` and no file under
    `d/e/`, and `d/e/` lists no files and no directories; after `d/e/f` is uploaded and deleted, `d/e/`
    is still listed in `d/`.
  - › `STOR-11: a listing is one level deep`: given `d/l/1.txt`, `d/l/sub/2.txt`, `d/l/sub/deeper/3.txt`,
    then `d/l/` lists the file `d/l/1.txt` and the directory `d/l/sub/` only, and no `next`.
  - › `STOR-11: pages list every entry exactly once`: given 7 files and 3 directories under `d/p/`,
    when listed with `limit: 3` following `next`, then no page holds more than 3, the last page has
    no `next`, no page after the first is empty, and the pages together hold the 10 names each exactly
    once.
  - › `STOR-11: startAfter lists only what sorts after it`: given `d/s/a`, `d/s/b`, `d/s/c`, when
    listed with `startAfter: 'd/s/a'`, then the files are `d/s/b` and `d/s/c`.
  - › `STOR-13: deleting a directory removes every object under it, and nothing beside it`: given
    `d/r/1`, `d/r/x/2`, `d/r-sibling`, and the directory `d/r/y/` created, when `deleteDirectory` of
    `d/r/`, then it resolves after which `d/r/` lists nothing, and `d/r-sibling` is read back.
  - › `STOR-14: moving a directory moves every object under it, names taken literally`: given
    `d/m/1`, `d/m/x/2` and `d/m-sibling`, when `moveDirectory` of `d/m/` to `d/n$&/`, then
    `d/n$&/1` and `d/n$&/x/2` are read back, `d/m/` lists nothing, and `d/m-sibling` is unchanged.
- `packages/conformance/test/storage.test.js` (conformance):
  - › `CONF-2: each assertion fails against its mutant`: given `test/mutants/storage.js`, one mutant
    of `memoryStorage` per suite test (a missing method, a check skipped, a wrong body, a version that
    never changes, `ifAbsent` ignored, a plain `Error` for a missing object, a delete of a missing
    object that resolves, a move that copies, no name check, a normalized name, a placeholder listed,
    two levels listed, `next` on the last page, an entry repeated across pages, `startAfter`
    inclusive, a delete that leaves a subdirectory, a move that expands `$&`), when the suite runs
    against each in a child Vitest, then exactly that mutant's test fails.
  - › `CONF-2: the suite cleans up after a failed test`: given a mutant whose `getObject` throws, when
    the suite runs, then afterwards the mutant's store holds no object under `genoacms-conformance-`.
- `packages/contracts/src/storage.test.js` (unit):
  - › `STOR-8: names itself and the object it refused`; › `STOR-8: isPreconditionFailed recognizes
    the error by name, including a copy from another module instance`; › `STOR-8:
    isPreconditionFailed rejects everything else`: the three existing tests, their titles carrying
    the ID, their assertions unchanged.
  - › `STOR-16: ObjectNotFoundError names itself and the missing object`: then `name`, `message`
    `storage/not-found: b/n` and `reference`.
  - › `STOR-16: isNotFound recognizes the error by name, and nothing else`: as STOR-8's two.
  - › `STOR-3: NotADirectoryError and isDirectoryName`: the message `storage/not-a-directory: b/n`;
    `isDirectoryName` true for `''`, `a/`, `a//`, false for `a`, `/a`, `a/b`.
- `packages/contracts/src/storage/types.test-d.ts` (unit):
  - › `STOR-1: the types that cross the contract`: `UploadOptions` refuses `gzip`; `pageToken` and
    `next` are optional strings; an `Adapter` missing a method does not type-check.
- `packages/adapter-gcp/src/storage/runtime.test.ts` (unit), the SDK mocked:
  - › `STO-3: the directory methods check the name after the bucket`: an unregistered bucket with a
    bad name rejects `bucket-unregistered`; a registered one rejects `storage/not-a-directory`; no
    SDK call.
  - › `STO-4, STOR-16: a 404 on the metadata rejects with ObjectNotFoundError`, and › `STO-4: another
    metadata failure reads without a version`.
  - › `STO-6: save receives only the precondition`: `uploadObject(ref, 'x', { ifAbsent: true })`
    calls `save('x', { preconditionOpts: { ifGenerationMatch: 0 } })`, and without options `save('x',
    {})`.
  - › `STO-7, STOR-16: a delete answered with 404 rejects with ObjectNotFoundError`.
  - › `STO-9: one request with limit, startOffset and pageToken; next from the response`: then
    `getFiles` receives `maxResults: 3`, `startOffset`, `pageToken: 't1'`, and the result's `next`
    is the response's `nextQuery.pageToken`; without a next query, `next` is absent.
  - › `STO-9: an entry named startAfter is left out and nothing else is cut`: given a response of 3
    entries the first of which is `startAfter`, then 2 are listed.
  - › `STO-9: limit 0 lists nothing and sends no request`: then the result is empty and `getFiles`
    was not called.
  - › `STO-10: a directory is kept by the placeholder under its name`: `createDirectory('a/')` saves
    `a/.folderPlaceholder`, not `a//.folderPlaceholder`.
  - › `STOR-15: errors propagate unchanged`: a `getFiles`, `save`, `move` and `delete` rejecting with
    an error `e` reject with `e` itself, and nothing is logged.
- `packages/adapter-gcp/test/contract/storage.test.ts` (contract): › `STO-4, STOR-16: rejects a
  missing object with ObjectNotFoundError` replaces `STO-4: reads a missing object without a
  version`; › `STO-7, STOR-16: rejects the delete of a missing object`; › `STO-9: pages a listing
  with limit and pageToken` replaces the `startAfter` paging test, and a test `STO-9: startAfter
  leaves out its own entry` keeps that check; › `STO-8, STOR-9: …` is STO-8's test, retitled.
- `packages/adapter-aws/src/storage/runtime.test.ts` (unit), the client mocked: › `OBJ-2: the
  directory methods check the name after the bucket`; › `OBJ-3, STOR-16: NoSuchKey rejects with
  ObjectNotFoundError`; › `OBJ-7, STOR-16: a delete heads first, and a 404 sends no DeleteObject`;
  › `OBJ-8: ContinuationToken in, NextContinuationToken out only when truncated`; › `OBJ-9: a
  directory is its name and the placeholder`; › `STOR-15: errors propagate unchanged`.
- `packages/adapter-aws/test/contract/storage.test.ts` (contract): › `OBJ-3, STOR-16: rejects a
  missing object with ObjectNotFoundError` replaces the `NoSuchKey` test; › `OBJ-7, STOR-16: rejects
  the delete of a missing object`; › `OBJ-8: pages a listing with limit and pageToken`; › `OBJ-5,
  STOR-9: …` retitled.
- `packages/adapter-minio/src/runtime.test.js` (unit), `minio` mocked as today:
  - › `MIO-2: passes only defined options to the client` and › `MIO-2: builds one client per
    provider`, the existing tests retitled.
  - › `MIO-3: an unregistered bucket is refused before any client call, and bucketExists is never
    called`.
  - › `MIO-4: reads the ETag from statObject, then the body`; › `MIO-4: NoSuchKey or NotFound rejects
    with ObjectNotFoundError`.
  - › `MIO-5: the public URL follows useSSL and the port`: `https://h:9000/b/a%2Fb.txt` and
    `http://h/b/x`.
  - › `MIO-6: presigns for the seconds until expires`.
  - › `MIO-7: ifAbsent and ifVersion are sent as If-None-Match and If-Match on one PUT of known size`:
    for a string, a `Buffer` and a stream, `putObject` receives the size and the header; a 412
    rejects with `PreconditionFailedError` and the reasons of STOR-7.
  - › `MIO-8: a move copies then removes; a failed copy removes nothing`; › `MIO-8: a delete of a
    missing object rejects with ObjectNotFoundError and removes nothing`.
  - › `MIO-9: one listObjectsV2Query with the prefix as given; the old placeholder hidden; next only
    when truncated`.
  - › `MIO-10: a directory is the empty object of its name`: `createDirectory('dir/')` puts
    the empty object `dir/`, and the old test asserting `.directoryPlaceholder` is removed.
  - › `MIO-11: deletes page by page, resolves after the last removal, and rejects with the first
    error`.
  - › `MIO-11: a key removeObjects reports as failed rejects with storage/delete-failed`: given
    `removeObjects` answering `[{ Key: 'd/1', Code: 'AccessDenied' }]`, then `deleteDirectory('d/')`
    rejects with `storage/delete-failed: b/d/1: AccessDenied`.
  - › `MIO-12: lists first, then moves one at a time, literally, and stops at the first failure`.
  - › `MIO-13: errors propagate unchanged, and nothing is written to the console`.
- `packages/adapter-minio/test/conformance.test.js` (conformance, opt-in): unchanged; with
  `GENOACMS_TEST_MINIO=1` it now runs the whole suite.
- `packages/core/src/lib/script/database/database.server.test.ts` (unit): › `COL-1: a directory of
  more than one page lists every definition`: given a stubbed storage whose listing of a database's
  directory answers two pages, then the catalog holds the names of both, in order; › `COL-2: a
  missing definition is collection/not-found`: the stub rejects with `ObjectNotFoundError`; › `COL-2:
  a storage failure while reading a definition propagates`: the stub rejects with `Error('boom')`,
  and resolution rejects with that error, not `collection/not-found`. The existing COL-2 test whose
  stub throws `Error('storage/not-found')` changes its stub to `ObjectNotFoundError`, its assertion
  unchanged.
- `packages/cli/src/database.test.js` (unit): › `CLI-10: lists every page of each collections
  directory`.

## Steps

1. Baseline: `pnpm -r test` passes at `unit`; `node scripts/test-level.mjs conformance` passes;
   `node docs/tools/check-docs.mjs docs` reports 0 errors.
2. **S3-compatible spike, before any code.** Done on 2026-10-18 (`adapter-minio.md` MS1): MinIO
   could not be obtained (MF3); RustFS and SeaweedFS honor both conditions and list an empty `dir/`
   as a directory, Garage ignores the conditions (MF4). MIO-7 was corrected to the codes observed.
   The MinIO adapter's tests and conformance run use RustFS:
   `podman run -d --name genoacms-s3-spike-rustfs -p 127.0.0.1:9100:9000 -e RUSTFS_ACCESS_KEY=<key>
   -e RUSTFS_SECRET_KEY=<secret> -v <dir>:/data:Z docker.io/rustfs/rustfs:latest /data`, with a bucket
   created first.
3. Tests: write the tests of §Tests from this RFC and the documents, by a session that has not seen
   the adapters' code, and mark `it.fails` each that fails before the code, and only those. The
   suite's tests fail against today's in-memory adapter, so step 4's `memory.js` lands with them.
   Two test files cannot pass before the code and are committed with it: `types.test-d.ts`, because
   a type test cannot be marked as an expected failure, and `adapter-minio/src/runtime.test.js`,
   because today's adapter raises unhandled rejections that fail the run whatever the markers.
   Commit.
4. `@genoacms/contracts`: the types and the two errors. `@genoacms/conformance`: the suite,
   `memory.js`, the mutants.
5. The GCP, AWS and MinIO runtimes.
6. Core and the CLI: `listWholeDirectory`, the two collections changes, the component and
   publication deletes, `genoa database`.
7. Remove every `it.fails`, change no assertion, add the changeset. Commit.
8. Run §Verification.
9. The documents to current: the changed statements take §Specification's text; STOR-16, CONF-2 and
   MIO-3 to MIO-13 lose their `State:` lines; each statement names its tests; CF44 to CF50, MF1,
   OF23, OF24 and OF29 are fixed; `verified` moves to the code commit; `docs/README.md` counts.

## Verification

```bash
pnpm -r test
# all pass
node scripts/test-level.mjs conformance
# all pass, the storage suite and its mutant test among them
GENOACMS_TEST_GCP=1 node scripts/test-level.mjs contract
# all pass, the storage suite against Cloud Storage among them
GENOACMS_TEST_AWS=1 node scripts/test-level.mjs contract
# all pass, the storage suite against S3 among them
GENOACMS_TEST_MINIO=1 GENOACMS_TEST_MINIO_BUCKET=<bucket> MINIO_ENDPOINT=127.0.0.1 MINIO_PORT=9100 MINIO_USE_SSL=false MINIO_ACCESS_KEY=<key> MINIO_SECRET_KEY=<secret> pnpm --filter @genoacms/adapter-minio test:conformance
# all pass, against RustFS (step 2)
node docs/tools/check-docs.mjs docs
# 0 error(s)
```

A falsification audit of every statement this RFC adds or changes (WORKFLOW §6.3), by an agent that
did not write the code, recorded as a Verification entry in `contracts/storage.md`, with the
adapters' parts in their own documents.

## Critique

**Pros**
- One error for a missing object lets core tell "not there" from "not reachable" on every adapter,
  which OF29 needed, and which the collections and publication code guessed at with GCP's `404`.
- One form of directory name removes a class of bugs in one place: OF23's double slash, and the
  prefix collisions of a name without `/` (RFC-0038's BF3 is one).
- Listings no longer stop at 1000 entries silently, for the catalog and the CLI now, and for the
  browser in RFC-0038.
- The suite becomes the executable contract: an adapter that drops a statement fails it, and its
  mutants show each test can fail (CD5). MinIO went wrong exactly because nothing checked it.

**Cons & trade-offs**
- Breaking for every adapter, third-party ones included, and for any caller passing a directory
  name without `/` or reading a missing object's stream to find out.
- A delete on AWS and MinIO costs a `HEAD` first, and between the two another client can delete the
  object, so the delete then succeeds silently where it should report not-found. The window is one
  round trip.
- GCP's reads keep their metadata call, now also for the not-found; MinIO's reads become two
  requests (MD2).
- The suite writes and deletes on real buckets in every contract run: about 40 objects per run.
- `listWholeDirectory` makes core's internal listings unbounded again, by design: the catalog and the
  component lists want everything, and a huge directory costs requests at start-up.

**Blindspots & missed edge cases**
- Only RustFS is tested (MS1); a server that ignores the conditions, as Garage does (MF4), passes the
  unit tests, and only the conformance suite against that server shows it. Nothing refuses such a
  server at runtime.
- `ifVersion` on a missing object answers `NoSuchKey` on RustFS and `PreconditionFailed` on
  SeaweedFS; both become `PreconditionFailedError`, so the caller cannot tell "deleted" from
  "changed".
- A page token is valid for how long the store says; a listing paused across a token's expiry is not
  covered.
- `moveObject` of a missing object, and `moveDirectory` of an empty directory, keep adapter-specific
  outcomes.
- GCS lists a prefix that holds only a placeholder in `directories`; S3 does the same; whether every
  S3-compatible server does is untested.
- A stream that fails part-way through a conditional MinIO write fails before the `PUT`; an
  unconditional one may leave a partial multipart upload behind, which the bucket's lifecycle rules
  must clean.
- Third-party adapters learn of the breaking change only from the changelog and from failing the
  suite.
