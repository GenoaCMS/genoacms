---
type: architecture
title: Storage contract
codes: [STOR]
verified: 813d2b5
---

# Storage contract

Part of the [service contracts](README.md). Markers, IDs and test references as defined there.

## Design

### Role

The storage service keeps objects in buckets: the files users upload through core's storage browser
and media fields, published pages, and the CMS's own state under `.genoacms/` in the default bucket
(sessions, manifests, keys, the security policy, collection definitions). Every storage adapter
implements the contract typed in `@genoacms/contracts/storage`, and core reaches it only through
`host.storageForBucket`, which routes a bucket to the provider the configuration assigns it to
([`host.md`](../host.md)).

This document specifies what every adapter promises. Each adapter specifies its own mapping onto it:
[`adapter-gcp/storage.md`](../adapter-gcp/storage.md) (Cloud Storage),
[`adapter-aws/storage.md`](../adapter-aws/storage.md) (S3),
[`adapter-minio.md`](../adapter-minio.md) (any S3-compatible server, tested against RustFS). What core does with the contract for users, the permission-checked layer and the storage
browser, is [`storage.md`](../storage.md).

```
core ── host.storageForBucket(bucket) ──▶ provider ──▶ Cloud Storage | S3 | MinIO
          one provider per bucket            Adapter: 10 methods (STOR-2)
```

Not part of the contract: cross-object atomicity, which no object store offers (CD8); creating or
configuring buckets, which is the operator's (`adapter-gcp/README.md`, `adapter-aws/README.md`);
object metadata other than size and modification time; access control on objects, which is the
bucket's configuration.

### Decisions

| # | Decision | Where |
| :-- | :-- | :-- |
| CU5 | 2026-10-18: a missing object is a contract error of its own: `getObject` rejects with `ObjectNotFoundError`, `storage/not-found`, recognized as the precondition error is (CF44). | STOR-16 |
| CU8 | 2026-10-18: deleting a missing object fails, with the error of CU5, on every adapter (CF45). | STOR-16 |
| CU6 | 2026-10-18: `@genoacms/adapter-minio` is brought to this contract by an RFC, with a document of its own and a conformance run that runs (CF49). | [`adapter-minio.md`](../adapter-minio.md), RFC-0037 |
| CU7 | 2026-10-18: `gzip` is removed from `UploadOptions`. No caller passes it, and only one adapter honors it (CF47, CU1). It may return as an optional capability (CD1). | STOR-1, STOR-7, RFC-0037 |
| CU9 | 2026-10-18: a directory's name is `''`, the root, or ends in `/`, everywhere in the contract, as listings already return it. The four directory methods refuse any other name, and `createDirectory('photos/')` writes `photos/.folderPlaceholder` (CF48). | STOR-3, STOR-12, RFC-0037 |
| CU10 | 2026-10-18: a listing is continued with an opaque page token: `DirectoryContents.next`, absent when the listing is complete, passed back as `DirectoryListingParams.pageToken`. A last name passed as `startAfter` cannot continue a listing, because the store folds the objects under a listed directory back into it (CF46). | STOR-1, STOR-11, RFC-0037 |

**CD8. A conditional write on one object is the contract's only concurrency primitive (STOR-6,
STOR-7).** `uploadObject` takes `ifAbsent` or `ifVersion`, and a refused write throws
`PreconditionFailedError`.
*Why:* object storage offers no transaction across objects, and the CMS does not pretend to one.
What every store does offer is a conditional write on a single object, and that is enough for the
problem a storage-first CMS has: two writers that both read an object and both write it back, the
second silently erasing the first. Sessions, manifests, the key registry, the security policy and
publications rely on it.
*Cost:* a change spanning several objects can be left half done. A caller that loses the race must
read again and decide; for a document a person is editing that means reporting a conflict, never
replaying the write.

**CD9. A version is an opaque token (STOR-6).** A GCS generation, an S3 or MinIO ETag.
*Why:* these are not comparable, orderable or meaningful across providers. Code that treats a
version as a number or a time works against one adapter and fails subtly against another.
*Cost:* a caller can only pass a version back to `uploadObject`; it cannot tell which of two versions
is newer.

**CD10. A directory is a name prefix ending in `/`; how an empty one is kept is the adapter's
(STOR-3, STOR-11, STOR-12).** The contract promises that a created directory is listed in its parent
while it holds nothing, and that a listing shows nothing the adapter wrote only to keep it. A store
that lists an empty directory needs nothing more; a store that lists a prefix only while an object
lies under it needs a placeholder object, which its adapter writes and hides. Cloud Storage is such a
store, and the GCP adapter writes `<name>.folderPlaceholder`; the AWS adapter writes the same name
(`adapter-aws/storage.md`, *Decisions*), so a bucket moved between the two keeps its empty
directories. MinIO lists an empty directory object `<name>` as a directory (`adapter-minio.md`).
*Why:* a placeholder exists only to work around a store, so the contract does not impose one on a
store that does not need it.
*Cost:* a bucket moved between adapters that keep empty directories differently shows the other's
placeholders as files, or loses its empty directories. An adapter that writes a placeholder never
lists a user's object of that name. Directory operations act on every object under the prefix and are
not atomic (STOR-13, STOR-14).

**CD11. A refused conditional write is recognized by the error's name (STOR-8).**
`isPreconditionFailed` checks `name === 'PreconditionFailedError'`, not `instanceof`.
*Why:* an adapter may resolve its own copy of `@genoacms/contracts`, and an `instanceof` check would
then miss its errors and treat a lost race as a fault.
*Cost:* any error named `PreconditionFailedError` passes, from whatever source.

### Findings

| # | Finding | State |
| :-- | :-- | :-- |
| CF44 | *History.* **A missing object is not told apart from a failure, and adapters report it differently** (STOR-5). The GCP adapter resolves `getObject` and fails only when the stream is read; the AWS adapter rejects with S3's `NoSuchKey`; the conformance package's in-memory adapter throws `not found: <bucket>/<name>`. No error code is common to them, so core cannot tell a missing object from an outage: `collections.md` OF29 is this finding seen from core. Found 2026-10-18 by reading the adapters at `de04f62`. | fixed, RFC-0037 |
| CF45 | *History.* **Deleting a missing object succeeds on AWS and fails on GCP** (STOR-10). `adapter-aws/storage.md` OBJ-7 resolves it, as S3 answers it with success; `adapter-gcp/storage.md` STO-7 propagates Cloud Storage's 404. Found 2026-10-18 by comparing the two Specifications. | fixed, RFC-0037 |
| CF46 | *History.* **A listing cannot be continued** (STOR-11). `limit` and `startAfter` exist, but a listing returns no sign that more entries remain, and Cloud Storage and S3 answer at most 1000 per request. A caller that passes no `limit` gets the first page and cannot know it is cut. Core passes neither (`collections.md` OF24). | fixed, RFC-0037 |
| CF47 | *History.* **`gzip` is honored by the GCP adapter only** (STOR-6). It passes the option to the client's `save`; the AWS adapter and the MinIO adapter drop it. CU1 admits into the contract only what every adapter can do. Found 2026-10-18 by reading the adapters at `de04f62`. | fixed, RFC-0037 |
| CF48 | *History.* **The contract does not say whether a directory's name ends in `/`** (STOR-3, STOR-12). Listings return directories with a trailing `/`; `createDirectory` appends `/.folderPlaceholder`, so a name that already ends in `/` writes `<name>//.folderPlaceholder`, a subdirectory with an empty name (`collections.md` OF23). | fixed, RFC-0037 |
| CF49 | *History.* **`@genoacms/adapter-minio` does not conform.** Found 2026-10-18 by reading `packages/adapter-minio/src/runtime.js` at `de04f62`; nothing was run, and its conformance run is not in CI (`docs/README.md`). (1) It has no `getPublicURL` (STOR-2). (2) The bucket check is not awaited, so an unregistered bucket's request is still sent and the check's rejection is unhandled, which ends a Node process (STOR-4). (3) It ignores `ifAbsent` and `ifVersion` and writes unconditionally, so every write core makes conditionally, sessions, manifests, the key registry, the security policy and publications included, can silently erase a concurrent one (STOR-6, CD8). (4) `getObject` returns no `version` (STOR-5). (5) It writes its placeholder, `.directoryPlaceholder`, with `path.join`, so a name ending in `/` loses it (STOR-3); which object keeps an empty directory is the adapter's own (CD10), and MIO-10 uses MinIO's own directory object. (6) `listDirectory` normalizes the name with `path.join`, which resolves `..` and collapses `//`, and ignores `limit` (STOR-3, STOR-11). (7) `deleteDirectory` resolves before anything is deleted, and a failure is thrown inside a stream handler, where nothing can catch it (STOR-13). (8) `moveDirectory` copies every object at once, renames by replacing the first occurrence of the old name, so `$` patterns in the new name are expanded (as `adapter-gcp/storage.md` GF22 was), and removes the originals only after every copy (STOR-14). (9) A listing error becomes `Failed to list directory` and is written with `console.log` (STOR-15). | fixed, RFC-0037 |
| CF50 | *History.* **The storage suite checks 5 of this contract's 15 statements, and its own in-memory adapter does not conform.** `CONF-2` uploads, lists, reads and deletes one object. Nothing in `@genoacms/conformance` checks conditional writes, versions, moves, directories or URLs, so an adapter can drop them unnoticed (CF49 went unnoticed this way). The in-memory adapter of `packages/conformance/test/memory.js` lists no directories, ignores `UploadOptions` and returns no version. Found 2026-10-18 by reading. | fixed, RFC-0037 |

### History

*History.* The contract lived in `@genoacms/cloudabstraction` from the monorepo's start; the 2026-09
redesign moved it into `@genoacms/contracts` with its signatures unchanged (RFC-0001,
[`configuration.md`](../configuration.md) A1 to A6). Conditional writes (`ifAbsent`, `ifVersion`, the
version on reads and `PreconditionFailedError`) were added on 2026-08-16 for core's optimistic
concurrency. `ObjectPayload` named only a stream until the CMS's own writes of strings contradicted
it. Until 2026-10-18 the types were the only description of the contract. RFC-0037 (2026-10-18) added
the not-found error, fixed the form of a directory's name, paged listings, removed `gzip`, brought the
MinIO adapter to the contract and grew the suite to the whole contract.

### Verification

Every statement names the tests that carry its ID (RFC-0037). They check it from four sides:

- **`unit`:** each adapter's runtime against its mocked client (`adapter-gcp`, `adapter-aws`,
  `adapter-minio`), and `@genoacms/contracts`' own errors and types.
- **`conformance`:** the suite of CONF-2, `packages/conformance/src/storage.js`, against the in-memory
  adapter, and against one mutant of it per test.
- **`contract`:** the same suite and each adapter's contract tests against real Cloud Storage and S3.
  The MinIO adapter runs the suite against RustFS (`adapter-minio.md` MS1), opt-in and not in CI
  (MF2).
- STOR-9's `getPublicURL` is checked for its form only, since serving needs a public bucket.
  STOR-13 and STOR-14's "lists before moving any" is checked through each adapter's mocked client.

*History.* The contract was written on 2026-10-18 from the types, the doc comments of
`packages/contracts/src/storage/`, the Specifications of the GCP and AWS adapters, and a reading of
the three adapters at `de04f62`. Where they disagreed, the statement followed the GCP and AWS
Specifications, and the disagreement became a finding (CF44 to CF50), all fixed by RFC-0037. On
2026-10-18 the contract runs passed against `genoacms-tests` (GCP, 42 tests) and
`genoacms-contract-724635704336` (AWS, 39 tests), and the MinIO adapter's against RustFS 1.0.3 (54).

## Specification

### Types

#### STOR-1 · The types that cross the contract

```ts
type ObjectName = string

interface ObjectReference {
  bucket: string
  name: ObjectName
}

interface StorageObject {
  name: string
  size: number
  lastModified: Date
}

type ObjectPayload = string | Buffer | NodeJS.ReadableStream

type ObjectVersion = string

interface UploadOptions {
  ifVersion?: ObjectVersion
  ifAbsent?: boolean
}

interface ObjectData {
  data: NodeJS.ReadableStream
  version?: ObjectVersion
}

interface DirectoryListingParams {
  startAfter?: string
  limit?: number
  pageToken?: string
}

interface DirectoryContents {
  files: StorageObject[]
  directories: ObjectReference[]
  next?: string
}
```

`StorageObject.name` and a directory's `ObjectReference.name` are full names from the bucket's root.
`size` is in bytes.

- Test: `packages/contracts/src/storage/types.test-d.ts`
- Level: unit

#### STOR-2 · The adapter

```ts
interface Adapter {
  getObject (reference: ObjectReference): Promise<ObjectData>
  getSignedURL (reference: ObjectReference, expires: Date): Promise<string>
  getPublicURL (reference: ObjectReference): Promise<string>
  uploadObject (reference: ObjectReference, data: ObjectPayload, options: UploadOptions): Promise<void>
  moveObject (reference: ObjectReference, destination: ObjectName): Promise<void>
  deleteObject (reference: ObjectReference): Promise<void>
  listDirectory (reference: ObjectReference, params?: DirectoryListingParams): Promise<DirectoryContents>
  createDirectory (reference: ObjectReference): Promise<void>
  deleteDirectory (reference: ObjectReference): Promise<void>
  moveDirectory (reference: ObjectReference, destination: ObjectName): Promise<void>
}
```

Every adapter implements all ten methods. A runtime's `create` returns the adapter for the buckets the
configuration assigns to it, given in `ctx.resources`.

- Test: `packages/adapter-aws/src/storage/runtime.test.ts`, `packages/adapter-gcp/src/storage/runtime.test.ts`, `packages/adapter-minio/src/runtime.test.js`, `packages/conformance/src/storage.js`
- Level: unit, conformance

### Names and buckets

#### STOR-3 · Names are used as given

An object's name is the whole key within its bucket. `/` separates directory levels: a directory is
the prefix of the names under it, ending in `/`, and the bucket's root is the empty prefix `''`. An
adapter neither normalizes nor resolves a name: `a//b`, `./a` and `a/../b` are names of their own.
A store **MAY** refuse such a name; its error then propagates (STOR-15), and nothing is written
under another name.

A **directory name** is `''` or a name ending in `/`. `listDirectory`, `createDirectory`,
`deleteDirectory` and `moveDirectory` take one, and `moveDirectory`'s destination is one; for any
other name they throw `NotADirectoryError`, message `storage/not-a-directory: <bucket>/<name>`,
after the bucket check (STOR-4) and before any request. `createDirectory`, `deleteDirectory` and
`moveDirectory` refuse `''` likewise.

- Test: `packages/adapter-aws/src/storage/runtime.test.ts`, `packages/adapter-gcp/src/storage/runtime.test.ts`, `packages/adapter-minio/src/runtime.test.js`, `packages/conformance/src/storage.js`, `packages/contracts/src/storage.test.js`
- Level: unit, conformance

#### STOR-4 · Only the provider's buckets

Every method first checks the reference's bucket against the buckets the runtime was given, and for
any other bucket throws an `Error` with the message `bucket-unregistered` before sending any
request. (`adapter-gcp/storage.md` STO-3, `adapter-aws/storage.md` OBJ-2.)

- Test: `packages/adapter-aws/src/storage/runtime.test.ts`, `packages/adapter-gcp/src/storage/runtime.test.ts`, `packages/adapter-minio/src/runtime.test.js`, `packages/conformance/src/storage.js`
- Level: unit

### Objects

#### STOR-5 · Reading an object

`getObject(reference)` returns `{ data, version }`: `data` is a stream of exactly the object's bytes,
and `version` the object's current version (STOR-6), or `undefined` when the adapter cannot supply one.
(STO-4, OBJ-3.)

- Test: `packages/adapter-aws/src/storage/runtime.test.ts`, `packages/adapter-gcp/src/storage/runtime.test.ts`, `packages/adapter-minio/src/runtime.test.js`, `packages/conformance/src/storage.js`
- Level: unit, conformance, contract

#### STOR-6 · Versions

A version is an opaque string (CD9). Every successful write to an object gives it a new version, and
a version read with `getObject` stays valid for `ifVersion` until the object is next written. A
caller never compares, orders or parses versions.

- Test: `packages/conformance/src/storage.js`
- Level: conformance, contract

#### STOR-7 · Writing an object

`uploadObject(reference, data, options)` writes `data` as the object's whole content and resolves to
`undefined`:

| `options` | Writes when |
| :-- | :-- |
| `ifAbsent: true` | no object of that name exists. Of any number of racing callers, exactly one succeeds. `ifVersion` is then ignored. |
| `ifVersion: v` | the object's current version is `v` |
| neither | always, replacing any object of that name |

A refused condition throws `PreconditionFailedError` (STOR-8) with the reason `object already exists`
for `ifAbsent`, and `object changed since it was read` for `ifVersion`. (STO-6, OBJ-6, MIO-7.)

- Test: `packages/adapter-aws/src/storage/runtime.test.ts`, `packages/adapter-gcp/src/storage/runtime.test.ts`, `packages/adapter-minio/src/runtime.test.js`, `packages/conformance/src/storage.js`
- Level: unit, conformance, contract

#### STOR-8 · The precondition error

```ts
declare class PreconditionFailedError extends Error {
  readonly name: 'PreconditionFailedError'
  readonly reference: ObjectReference
  readonly reason: string
  constructor (reference: ObjectReference, reason: string)
}
declare function isPreconditionFailed (error: unknown): boolean
```

`@genoacms/contracts/storage` exports both. The error's message is
`storage/precondition-failed: <bucket>/<name>: <reason>`. `isPreconditionFailed` is true for any
non-null object whose `name` is `PreconditionFailedError`, and false for everything else (CD11).

- Test: `packages/conformance/src/storage.js`, `packages/contracts/src/storage.test.js`
- Level: unit

#### STOR-9 · URLs

`getSignedURL(reference, expires)` returns a URL from which anyone can read the object without
credentials until `expires`, and not after; it **MAY** stop working earlier when the credentials that
signed it expire (`adapter-aws/storage.md` OBJ-5). `getPublicURL(reference)` returns the URL at which
the object is served when the bucket allows public reads; it does not check that it does. Neither
checks that the object exists. (STO-5, STO-8, OBJ-4, OBJ-5.)

- Test: `packages/adapter-aws/src/storage/runtime.test.ts`, `packages/adapter-aws/test/contract/storage.test.ts`, `packages/adapter-gcp/src/storage/urls.test.ts`, `packages/adapter-gcp/test/contract/storage.test.ts`, `packages/adapter-minio/src/runtime.test.js`
- Level: unit, contract

#### STOR-10 · Moving and deleting an object

`moveObject(reference, destination)` gives the object the name `destination` in the same bucket, with
the same content, and the old name no longer exists. `deleteObject(reference)` removes the object.
Both resolve to `undefined`. (STO-7, OBJ-7.)

- Test: `packages/adapter-aws/src/storage/runtime.test.ts`, `packages/adapter-gcp/src/storage/runtime.test.ts`, `packages/adapter-minio/src/runtime.test.js`, `packages/conformance/src/storage.js`
- Level: unit, conformance, contract

### Directories

#### STOR-11 · Listing one level

`listDirectory({ bucket, name }, { limit?, startAfter?, pageToken? })` lists the entries directly
under the directory `name`, one level deep, from one request:

- `files`: each object whose name starts with `name` and has no further `/` after it, except the
  object named exactly `name` and any object the adapter wrote only to keep an empty directory
  (STOR-12), with its `name`,
  `size` (`0` when unknown) and `lastModified`;
- `directories`: each prefix `name` + `<segment>/` under which at least one object exists, as
  `{ bucket, name }`, its name ending in `/`;
- `next`: present when the store has more entries after this page, absent when the listing is
  complete. It is opaque, and only passed back as `pageToken`.

With `pageToken`, the listing continues after the page that returned it; the other parameters are
the same as for that page. Every page holds at most `limit` entries, files and directories
together, or the store's own maximum without `limit`. Following `next` from the first page to the
last lists each entry exactly once. With `startAfter`, only entries whose name sorts after it are
listed, `startAfter` itself excluded. (STO-9, OBJ-8, MIO-9.)

- Test: `packages/adapter-aws/src/storage/runtime.test.ts`, `packages/adapter-gcp/src/storage/runtime.test.ts`, `packages/adapter-minio/src/runtime.test.js`, `packages/conformance/src/storage.js`
- Level: unit, conformance, contract

#### STOR-12 · Creating a directory

`createDirectory({ bucket, name })`, `name` a directory name other than `''` (STOR-3), writes the
directory `name`: it is listed in its parent while it holds nothing else, and no listing shows
anything it wrote as a file. How it is kept is the adapter's (CD10): the GCP and AWS adapters write
`<name>.folderPlaceholder` (STO-10, OBJ-9), the MinIO adapter the empty object `<name>` (MIO-10).

- Test: `packages/adapter-aws/src/storage/runtime.test.ts`, `packages/adapter-gcp/src/storage/runtime.test.ts`, `packages/adapter-minio/src/runtime.test.js`, `packages/conformance/src/storage.js`
- Level: unit, conformance, contract

#### STOR-13 · Deleting a directory

`deleteDirectory({ bucket, name })` deletes every object whose name starts with `name`, at every
depth, placeholders included, and resolves only after they are deleted. The first failure rejects
with that failure; no further delete starts, and the directory is left partly deleted. (STO-11,
OBJ-10.)

- Test: `packages/adapter-aws/src/storage/runtime.test.ts`, `packages/adapter-gcp/src/storage/runtime.test.ts`, `packages/adapter-minio/src/runtime.test.js`, `packages/conformance/src/storage.js`
- Level: unit, conformance, contract

#### STOR-14 · Moving a directory

`moveDirectory({ bucket, name }, destination)` lists every object whose name starts with `name`, at
every depth, before moving any, then moves each as STOR-10 to `destination` followed by the rest of
its name after `name`, taken literally. The first failure rejects with that failure; no further move
starts, and the directory is left partly moved. (STO-12, OBJ-11.)

- Test: `packages/adapter-aws/src/storage/runtime.test.ts`, `packages/adapter-gcp/src/storage/runtime.test.ts`, `packages/adapter-minio/src/runtime.test.js`, `packages/conformance/src/storage.js`
- Level: unit, conformance, contract

### Failures

#### STOR-15 · Failures propagate

Apart from `bucket-unregistered` (STOR-4), `NotADirectoryError` (STOR-3), `PreconditionFailedError`
(STOR-7) and `ObjectNotFoundError` (STOR-16), a method that
fails rejects with its service's error unchanged. It does not resolve in place of failing, does not
replace the error with one of its own, and writes nothing to the console.

- Test: `packages/adapter-aws/src/storage/runtime.test.ts`, `packages/adapter-gcp/src/storage/runtime.test.ts`, `packages/adapter-minio/src/runtime.test.js`
- Level: unit

#### STOR-16 · A missing object

```ts
declare class ObjectNotFoundError extends Error {
  readonly name: 'ObjectNotFoundError'
  readonly reference: ObjectReference
  constructor (reference: ObjectReference)
}
declare function isNotFound (error: unknown): boolean
```

`getObject` of an object that does not exist rejects with `ObjectNotFoundError`, message
`storage/not-found: <bucket>/<name>`, before it returns a stream; no adapter reports a missing object
any other way. `deleteObject` of an object that does not exist rejects with the same error, and deletes nothing. `@genoacms/contracts/storage` exports both. `isNotFound` is true for any non-null
object whose `name` is `ObjectNotFoundError`, and false for everything else, as CD11. This is an
exception to STOR-15.

- Test: `packages/adapter-aws/src/storage/runtime.test.ts`, `packages/adapter-aws/test/contract/storage.test.ts`, `packages/adapter-gcp/src/storage/runtime.test.ts`, `packages/adapter-gcp/test/contract/storage.test.ts`, `packages/adapter-minio/src/runtime.test.js`, `packages/conformance/src/storage.js`, `packages/contracts/src/storage.test.js`
- Level: unit, conformance, contract
