---
type: architecture
title: MinIO storage adapter
prefix: M
codes: [MIO]
verified: 82ff8fe
---

# MinIO storage adapter

## Design

### Role

`@genoacms/adapter-minio` serves GenoaCMS buckets from MinIO, or from any server that speaks the S3
API as MinIO does, for self-hosted instances (core's `genoa.config/self-hosted.ts`). A provider
serves the buckets the configuration assigns to it, and implements the storage contract
([`contracts/storage.md`](contracts/storage.md)) through the `minio` client library, 8.x.

The adapter did not conform to the contract until RFC-0037 (MF1); every runtime statement below is
**New**. The descriptor is current.

### Decisions

| # | Decision | Where |
| :-- | :-- | :-- |
| MU1 | 2026-10-18: the adapter is brought to the storage contract, keeping the `minio` client library (`contracts/storage.md` CU6). | MIO-3 to MIO-13 |

**MD1. A conditional write is one `PUT` with the condition as a header (MIO-7).** `If-None-Match: *`
for `ifAbsent`, `If-Match: <version>` for `ifVersion`. A stream is read into memory first, so its
size is known and the client sends one request rather than a multipart upload.
*Why:* a multipart upload checks a condition only when it completes, after every part is sent, and
the client library chooses multipart for a stream of unknown size. The CMS writes conditionally only
small JSON documents, as on AWS (`adapter-aws/storage.md`, *Decisions*).
*Cost:* a conditional write of a large stream is held in memory whole.

**MD2. The version is the ETag, read with `statObject` before the object (MIO-4).**
*Why:* `getObject` of the client library returns the body stream without the response's headers.
*Cost:* every read is two requests, and the version can belong to a newer write than the bytes
read when a write lands between them; the conditional write that follows is then refused, never
lost.

**MD3. An empty directory is MinIO's own directory object, with no placeholder (MIO-10;
`contracts/storage.md` CD10).** `createDirectory('dir/')` writes the empty object `dir/`, which
MinIO lists in the parent as the directory `dir/` while nothing else lies under it.
*Why:* MinIO keeps an empty directory itself; a placeholder would only work around a store that does
not.
*Cost:* a bucket written by the GCP or AWS adapter shows their `.folderPlaceholder` objects as files
when MinIO serves it, and a bucket written here loses its empty directories when they serve it.

**MD4. Listings hide the old placeholder (MIO-9).** Directories created before RFC-0037 hold
`.directoryPlaceholder`; listings hide objects ending in it.
*Why:* existing buckets keep looking as they did without a migration.
*Cost:* a user's object ending in `.directoryPlaceholder` is never listed.

### Findings

| # | Finding | State |
| :-- | :-- | :-- |
| MF1 | **The adapter does not conform to the storage contract.** The nine defects are `contracts/storage.md` CF49. | open, RFC-0037 |
| MF2 | **No conformance run happens.** The MinIO server images on Docker Hub and quay.io now require registry authentication, so CI has no MinIO (`docs/README.md`, known gaps); the opt-in run needs a server the operator provides. | open |

### History

*History.* The adapter was written in 2024 against an earlier storage contract and kept its bodies
through the 2026-09 redesign (RFC-0008), which moved it onto `defineRuntime` and the provider's
bucket list. It never gained conditional writes, versions or `getPublicURL` when the contract did
(2026-08-16).

### Verification

Established from the source of `minio` 8.0.7, not run: `putObject` passes `If-Match` and
`If-None-Match` through as request headers, and uploads in one request below its part size when the
size is known; `listObjectsV2Query(bucket, prefix, continuationToken, delimiter, maxKeys,
startAfter)` lists one page and answers `isTruncated` and `nextContinuationToken`. From MinIO's documentation as recalled, not run: an empty object whose name ends in `/` is listed as
a directory while nothing else lies under it. Whether the MinIO server honors both conditions on
`PutObject`, and lists such an object so, is not verified; RFC-0037 checks both first.

## Specification

### Descriptor

#### MIO-1 · Descriptor

Specifier `@genoacms/adapter-minio`, kind `storage`. Runtime specifier
`@genoacms/adapter-minio/runtime`. Options `endPoint` (required, a non-empty string), `port` (an
integer from 1 to 65535), `useSSL` (a boolean), `region`, and `accessKey` and `secretKey` (required,
secrets decoded as strings). Any other option is refused with `unknown option '<key>'`.

- Test: unverified
- Level: unit

#### MIO-2 · One client per provider

Each provider constructs its own client from its options, passing only the options that are
defined.

- Test: unverified
- Level: unit

### Runtime

#### MIO-3 · Only registered buckets

Every method first checks the reference's bucket against the provider's buckets and throws
`bucket-unregistered` for any other, before any request. It asks the server nothing to check a
bucket. The directory methods then check the name (`contracts/storage.md` STOR-3).

- Test: none yet
- Level: unit
- State: new (RFC-0037)

#### MIO-4 · Reading an object

`getObject(ref)` calls `statObject` and then `getObject`, and returns `{ data, version }`: the body
stream, and the ETag `statObject` reported. An S3 error code `NoSuchKey` or `NotFound` from either
call rejects with `ObjectNotFoundError` (STOR-16); other errors propagate unchanged (MD2).

- Test: none yet
- Level: unit, conformance
- State: new (RFC-0037)

#### MIO-5 · Public URL

`getPublicURL(ref)` returns `<scheme>://<endPoint>[:<port>]/<bucket>/<encodeURIComponent(name)>`,
`https` when `useSSL` is true and `http` otherwise, the port only when configured. It does not check
that the object is public.

- Test: none yet
- Level: unit
- State: new (RFC-0037)

#### MIO-6 · Signed URL

`getSignedURL(ref, expires)` returns the client's presigned `GET` URL, valid for
`floor((expires − now) / 1000)` seconds. A lifetime the client refuses propagates its error.

- Test: none yet
- Level: unit
- State: new (RFC-0037)

#### MIO-7 · Writing an object

`uploadObject(ref, data, options)`: `ifAbsent: true` writes with the header `If-None-Match: *`;
otherwise `ifVersion` writes with `If-Match: <ifVersion>`; otherwise the write is unconditional. A
conditional write of a stream reads it into a buffer first (MD1). A conditional write answered with
HTTP 412 throws `PreconditionFailedError` with the reasons of STOR-7; other errors propagate
unchanged.

- Test: none yet
- Level: unit, conformance
- State: new (RFC-0037)

#### MIO-8 · Moving and deleting an object

`moveObject(ref, newName)` copies the object to `newName` in the same bucket, then removes the
original; a failed copy removes nothing. `deleteObject(ref)` calls `statObject` first, rejects with
`ObjectNotFoundError` when it answers `NotFound` or `NoSuchKey`, and otherwise removes the object.

- Test: none yet
- Level: unit, conformance
- State: new (RFC-0037)

#### MIO-9 · Listing one level

`listDirectory({ bucket, name }, { limit?, startAfter?, pageToken? })` makes one
`listObjectsV2Query` with the prefix `name` as given, the delimiter `/`, `maxKeys` `limit` or 1000,
`startAfter` and the continuation token `pageToken`. `files` exclude the object named exactly `name`
and objects whose name ends in `.directoryPlaceholder` (MD4); `directories`
are the returned prefixes other than `name`, as `{ bucket, name }`. `next` is the response's
`nextContinuationToken` when it is truncated, and absent otherwise.

- Test: none yet
- Level: unit, conformance
- State: new (RFC-0037)

#### MIO-10 · Creating a directory

`createDirectory({ bucket, name })` writes the empty object `<name>`, MinIO's directory object (MD3).

- Test: none yet
- Level: unit, conformance
- State: new (RFC-0037)

#### MIO-11 · Deleting a directory

`deleteDirectory({ bucket, name })` lists every object whose name starts with `name`, at every
depth, page by page, and removes each page's objects with `removeObjects` before listing the next.
The first error, of a listing or of a removal, rejects with that error and nothing further is
listed or removed. It resolves only after every object is removed.

- Test: none yet
- Level: unit, conformance
- State: new (RFC-0037)

#### MIO-12 · Moving a directory

`moveDirectory({ bucket, name }, newName)` lists every object whose name starts with `name`, at
every depth, before moving any, then moves them one at a time as MIO-8, each to `newName` followed
by the rest of its name after `name`, taken literally. The first failure rejects with that failure,
and nothing further is moved.

- Test: none yet
- Level: unit, conformance
- State: new (RFC-0037)

#### MIO-13 · Failures propagate

Apart from MIO-3, MIO-4, MIO-7 and MIO-8, an error of the client library rejects the call
unchanged. The adapter writes nothing to the console.

- Test: none yet
- Level: unit
- State: new (RFC-0037)
