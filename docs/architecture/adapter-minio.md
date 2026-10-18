---
type: architecture
title: S3-compatible storage adapter (adapter-minio)
prefix: M
codes: [MIO]
verified: 813d2b5
---

# S3-compatible storage adapter (adapter-minio)

## Design

### Role

`@genoacms/adapter-minio` serves GenoaCMS buckets from any S3-compatible server for self-hosted
instances (core's `genoa.config/self-hosted.ts`). It keeps the name of the server it was written for,
MinIO, whose open-source edition is now archived (MF3). A provider serves the buckets the
configuration assigns to it, and implements the storage contract
([`contracts/storage.md`](contracts/storage.md)) through the `minio` client library, 8.x.

A server qualifies when it honors `If-None-Match: *` and `If-Match` on `PutObject`; one that ignores
them would silently lose conditional writes (MF4). The adapter is tested against RustFS (MU2).

The adapter conforms to the contract since RFC-0037 (MF1).

### Decisions

| # | Decision | Where |
| :-- | :-- | :-- |
| MU1 | 2026-10-18: the adapter is brought to the storage contract, keeping the `minio` client library (`contracts/storage.md` CU6). | MIO-3 to MIO-13 |
| MU2 | 2026-10-18: with open-source MinIO archived (MF3), the adapter serves any S3-compatible server and keeps its name and package, to avoid publishing a new one. It is tested against a maintained server, RustFS (MS1). | Role, MF2 |

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
| MF1 | *History.* **The adapter does not conform to the storage contract.** The nine defects are `contracts/storage.md` CF49. | fixed, RFC-0037 |
| MF2 | *History.* **No conformance run happens in CI.** The MinIO server images on Docker Hub and quay.io now require registry authentication, so CI has no MinIO (`docs/README.md`, known gaps). The opt-in run needs a server the operator provides; RustFS's image pulls without authentication (MS1). | fixed: CI starts RustFS, pinned by digest, and the conformance level runs the suite against it (author, 2026-10-18) |
| MF3 | **Open-source MinIO is archived.** On 2026-10-18 `dl.min.io` answers 410 Gone, saying the open-source MinIO Server, `mc` and KES are archived, with no security updates or advisories, and the GitHub repository `minio/minio` is archived (last push 2026-04-24). Both registries refuse anonymous pulls. | decided by MU2 |
| MF4 | **Garage ignores conditional writes.** Garage 2.1.0 accepts `PutObject` with `If-None-Match: *` on an existing key and with a stale `If-Match`, and overwrites the object (MS1). Served by this adapter, core's conditional writes would silently lose updates (`contracts/storage.md` CD8). | open: Garage is not a qualifying server |
| MF5 | **RustFS refuses some names Cloud Storage and S3 accept.** RustFS 1.0.3 answers `InvalidArgument: Invalid object key` to a key with an empty level (`a//b`), or a `.` or `..` level, so such a name cannot be written through this adapter there (`contracts/storage.md` STOR-3 allows a store to refuse it; `storage.md` BD8). Shown on 2026-10-18 by the RFC-0037 conformance run. | accepted, author 2026-10-18 |

### History

*History.* The adapter was written in 2024 against an earlier storage contract and kept its bodies
through the 2026-09 redesign (RFC-0008), which moved it onto `defineRuntime` and the provider's
bucket list. It never gained conditional writes, versions or `getPublicURL` when the contract did
(2026-08-16). RFC-0037 (2026-10-18) rewrote the runtime to the contract, for any S3-compatible
server that honors conditional writes (MU2).

### Verification

**MS1, spike of RFC-0037 step 2, 2026-10-18, by experiment.** Through `minio` 8.0.7's `putObject`
with a known size, against RustFS 1.0.3 (`docker.io/rustfs/rustfs`), Garage 2.1.0
(`docker.io/dxflrs/garage:v2.1.0`) and SeaweedFS (`docker.io/chrislusf/seaweedfs`, latest), each in
podman on 127.0.0.1. MinIO itself could not be obtained (MF3).

| Check | RustFS 1.0.3 | Garage 2.1.0 | SeaweedFS |
| :-- | :-- | :-- | :-- |
| `If-None-Match: *` on an existing key | refused, `code` `PreconditionFailed` | ignored, overwritten | refused, `PreconditionFailed` |
| `If-Match` stale | refused, `PreconditionFailed` | ignored, overwritten | refused, `PreconditionFailed` |
| `If-Match` on a missing key | `NoSuchKey` | written | `PreconditionFailed` |
| one `PUT` of known size, headers on the wire | yes (traced) | not traced | not traced |
| empty object `dir/` | listed in the root as the directory `dir/`, not a file; listing `dir/` returns it as a file of size 0; still listed after `dir/f` is added and removed | same | same |
| missing key | `statObject` `NotFound`, `getObject` `NoSuchKey` | same | same |
| `removeObject` of a missing key | succeeds | succeeds | succeeds |
| 5 objects, `maxKeys` 2 | pages 2, 2, 1; each once; opaque tokens | same | same; the token is the last key |

Across all three: the client's `S3Error` has no HTTP status, only `code`; `statObject` and
`putObject` give the ETag without quotes, which `If-Match` accepts; Garage needs `region: 'garage'`.
RustFS is chosen for tests: one container, credentials from two variables, MinIO's own error codes,
and an image built the day before.

## Specification

### Descriptor

#### MIO-1 · Descriptor

Specifier `@genoacms/adapter-minio`, kind `storage`. Runtime specifier
`@genoacms/adapter-minio/runtime`. Options `endPoint` (required, a non-empty string), `port` (an
integer from 1 to 65535), `useSSL` (a boolean), `region`, and `accessKey` and `secretKey` (required,
secrets decoded as strings). Any other option is refused with `unknown option '<key>'`.

- Test: `packages/adapter-minio/src/descriptor.test.js`
- Level: unit

#### MIO-2 · One client per provider

Each provider constructs its own client from its options, passing only the options that are
defined.

- Test: `packages/adapter-minio/src/runtime.test.js`
- Level: unit

### Runtime

#### MIO-3 · Only registered buckets

Every method first checks the reference's bucket against the provider's buckets and throws
`bucket-unregistered` for any other, before any request. It asks the server nothing to check a
bucket. The directory methods then check the name (`contracts/storage.md` STOR-3).

- Test: `packages/adapter-minio/src/runtime.test.js`
- Level: unit

#### MIO-4 · Reading an object

`getObject(ref)` calls `statObject` and then `getObject`, and returns `{ data, version }`: the body
stream, and the ETag `statObject` reported. An S3 error code `NoSuchKey` or `NotFound` from either
call rejects with `ObjectNotFoundError` (STOR-16); other errors propagate unchanged (MD2).

- Test: `packages/adapter-minio/src/runtime.test.js`, `packages/adapter-minio/test/conformance.test.js`
- Level: unit, conformance

#### MIO-5 · Public URL

`getPublicURL(ref)` returns `<scheme>://<endPoint>[:<port>]/<bucket>/<encodeURIComponent(name)>`,
`https` when `useSSL` is true and `http` otherwise, the port only when configured. It does not check
that the object is public.

- Test: `packages/adapter-minio/src/runtime.test.js`
- Level: unit

#### MIO-6 · Signed URL

`getSignedURL(ref, expires)` returns the client's presigned `GET` URL, valid for
`floor((expires − now) / 1000)` seconds. A lifetime the client refuses propagates its error.

- Test: `packages/adapter-minio/src/runtime.test.js`
- Level: unit

#### MIO-7 · Writing an object

`uploadObject(ref, data, options)`: `ifAbsent: true` writes with the header `If-None-Match: *`;
otherwise `ifVersion` writes with `If-Match: <ifVersion>`; otherwise the write is unconditional. A
conditional write of a stream reads it into a buffer first (MD1). A conditional write refused with
the S3 code `PreconditionFailed`, or an `ifVersion` write answered `NoSuchKey` because the object
is gone, throws `PreconditionFailedError` with the reasons of STOR-7 (MS1); other errors propagate
unchanged.

- Test: `packages/adapter-minio/src/runtime.test.js`, `packages/adapter-minio/test/conformance.test.js`
- Level: unit, conformance

#### MIO-8 · Moving and deleting an object

`moveObject(ref, newName)` copies the object to `newName` in the same bucket, then removes the
original; a failed copy removes nothing. `deleteObject(ref)` calls `statObject` first, rejects with
`ObjectNotFoundError` when it answers `NotFound` or `NoSuchKey`, and otherwise removes the object.

- Test: `packages/adapter-minio/src/runtime.test.js`, `packages/adapter-minio/test/conformance.test.js`
- Level: unit, conformance

#### MIO-9 · Listing one level

`listDirectory({ bucket, name }, { limit?, startAfter?, pageToken? })` makes one
`listObjectsV2Query` with the prefix `name` as given, the delimiter `/`, `maxKeys` `limit` or 1000,
`startAfter` and the continuation token `pageToken`. `files` exclude the object named exactly `name`
and objects whose name ends in `.directoryPlaceholder` (MD4); `directories`
are the returned prefixes other than `name`, as `{ bucket, name }`. `next` is the response's
`nextContinuationToken` when it is truncated, and absent otherwise.

- Test: `packages/adapter-minio/src/runtime.test.js`, `packages/adapter-minio/test/conformance.test.js`
- Level: unit, conformance

#### MIO-10 · Creating a directory

`createDirectory({ bucket, name })` writes the empty object `<name>`, MinIO's directory object (MD3).

- Test: `packages/adapter-minio/src/runtime.test.js`, `packages/adapter-minio/test/conformance.test.js`
- Level: unit, conformance

#### MIO-11 · Deleting a directory

`deleteDirectory({ bucket, name })` lists every object whose name starts with `name`, at every
depth, page by page, and removes each page's objects with `removeObjects` before listing the next.
The first error, of a listing or of a removal, rejects with that error and nothing further is
listed or removed. A key `removeObjects` reports as failed in its answer rejects with
`storage/delete-failed: <bucket>/<key>: <code>`, as on AWS (`adapter-aws/storage.md` OBJ-10). It resolves only after every object is removed.

- Test: `packages/adapter-minio/src/runtime.test.js`, `packages/adapter-minio/test/conformance.test.js`
- Level: unit, conformance

#### MIO-12 · Moving a directory

`moveDirectory({ bucket, name }, newName)` lists every object whose name starts with `name`, at
every depth, before moving any, then moves them one at a time as MIO-8, each to `newName` followed
by the rest of its name after `name`, taken literally. The first failure rejects with that failure,
and nothing further is moved.

- Test: `packages/adapter-minio/src/runtime.test.js`, `packages/adapter-minio/test/conformance.test.js`
- Level: unit, conformance

#### MIO-13 · Failures propagate

Apart from MIO-3, MIO-4, MIO-7 and MIO-8, an error of the client library rejects the call
unchanged. The adapter writes nothing to the console.

- Test: `packages/adapter-minio/src/runtime.test.js`
- Level: unit
