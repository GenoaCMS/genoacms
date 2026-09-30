---
type: architecture
title: AWS storage: S3
codes: [OBJ]
verified: bbb105f
---

# AWS storage: S3

Part of the [AWS adapter architecture](README.md). Markers, IDs and test references as defined there.

## Design

### Role

`@genoacms/adapter-aws/storage` serves GenoaCMS buckets from S3. A provider serves the buckets the
config assigns to it (`configuration.md` §5.5), and core's storage browser, media fields and
publication all go through it.

### Decisions

**Versions are ETags (OBJ-3, OBJ-6).** S3 returns the ETag with every read and accepts `If-Match` and
`If-None-Match: *` on `PutObject`, which is exactly what core's optimistic concurrency needs.
*Cost:* conditional writes go through a single `PutObject`, not the multipart uploader, because
multipart evaluates the condition only at completion, after every part is uploaded. A single
`PutObject` takes at most 5 GB. Core writes conditionally only small JSON documents.

**Directories are prefixes with a placeholder object, as on GCP (WD1; OBJ-8, OBJ-9).** S3 has no
directories. `createDirectory` writes `<name>/.folderPlaceholder`, the object the GCP adapter writes,
and listings hide it.
*Cost:* an object whose name ends in `.folderPlaceholder` is hidden from listings. Directories created
with S3's console, which writes an empty `name/` object, are listed but that object is not shown.

**A move is a copy and a delete (OBJ-7, OBJ-11).** S3 has no rename.
*Cost:* `CopyObject` takes objects up to 5 GB; a larger one fails the move. A move that fails between
the copy and the delete leaves the object under both names. A directory move is not atomic: a failure
part-way leaves it partly moved, as on GCP (`adapter-gcp/storage.md` GF10).

### Findings

| # | Finding | State |
| :-- | :-- | :-- |
| WF1 | **`moveObject`, `deleteDirectory` and `moveDirectory` are not implemented** (OBJ-7, OBJ-10, OBJ-11). The contract requires them, and core's storage browser, component editor and publication call them. On AWS, renaming a file, removing a directory or unpublishing a component throws `TypeError`. | open |
| WF2 | **`getObject` swallows every error** (OBJ-3). It logs it and resolves `undefined`, so a caller destructuring `{ data, version }` throws `TypeError`, and a denied permission reads like a missing object. | open |
| WF4 | **Listings differ from the contract's shape** (OBJ-8). `directories` are strings, not `{ bucket, name }` references. A prefix holding only subdirectories lists as empty, because the result returns early when there are no files. The name is normalized with `path.join`, which collapses `//` and resolves `..`. | open |
| WF5 | **Directories are `name/` objects, created after a full read** (OBJ-9). `createDirectory` first downloads `name` with `GetObject` to check it exists, and throws `Directory already exists` when an object of that name does, then writes `name/`, not the GCP adapter's placeholder. | open |
| WF6 | **`getPublicURL`, `getSignedURL` and `createDirectory` skip the bucket check** (OBJ-2), so they act on buckets the config never assigned to the provider. | open |
| WF7 | **`ifAbsent` and `ifVersion` together send both conditions** (OBJ-6). The GCP adapter lets `ifAbsent` win. | open |

### History

*History.* Storage was the adapter's first service (2023-10). Conditional writes were added on
2026-08-16 for core's optimistic concurrency. RFC-0007 moved the bodies into the runtime unchanged,
except the bucket check, which now uses the host's resource list.

### Verification

- **Established from AWS's documentation, not by experiment:** a failed `If-Match` answers 412; a failed `If-None-Match: *` answers 412, or 409 when a concurrent write to the same key is detected during the request. `StartAfter` is exclusive.

## Specification

### Descriptor

#### OBJ-1 · Descriptor

Specifier `@genoacms/adapter-aws/storage`, kind `storage`. Runtime specifier `@genoacms/adapter-aws/storage/runtime`. Options `region: string` (required) and `credentials?: Secret<AwsCredentials>`, decoded as JSON. Validation follows AWS-2 and AWS-3.

- Test: unverified (the tests name no statement, WF19)
- Level: unit

### Runtime

One `S3Client` per provider (AWS-4). The runtime receives its bucket names in `ctx.resources`.

#### OBJ-2 · Only registered buckets

Every method first checks the reference's bucket against `ctx.resources`. An unlisted bucket throws `bucket-unregistered` before any request.

- Test: none yet
- Level: unit
- State: new (no RFC yet)

#### OBJ-3 · Reading an object

`getObject({ bucket, name })` sends `GetObject` and returns `{ data, version }`: `data` is the response body stream, and `version` is the response's `ETag`, quotes included, as S3 sends it. A missing object rejects with S3's `NoSuchKey` error, and every other error propagates unchanged (WD2). Unlike GCP, where a missing object fails only when its stream is read, the call itself rejects.

- Test: none yet
- Level: unit, contract
- State: new (no RFC yet)

#### OBJ-4 · Public URL

`getPublicURL(ref)` returns `https://<bucket>.s3.<region>.amazonaws.com/<encodeURIComponent(name)>`, with the provider's `region`, so a `/` in the name appears as `%2F`. It does not check that the object is public: that is the bucket's policy.

- Test: none yet
- Level: unit
- State: new (no RFC yet)

#### OBJ-5 · Signed URL

`getSignedURL(ref, expires)` returns a Signature Version 4 presigned URL for `GetObject` of the object, valid for `floor((expires − now) / 1000)` seconds. It is signed with the client's credentials, so under an execution role it stops working when the role's session expires, which can be before `expires`. A lifetime over 604800 seconds (7 days) or under 1 second is refused by the presigner, and its error propagates.

- Test: none yet
- Level: unit, contract
- State: new (no RFC yet)

#### OBJ-6 · Conditional writes

`uploadObject(ref, data, options)`: `ifAbsent: true` sends `PutObject` with `IfNoneMatch: '*'`; otherwise `ifVersion` sends `PutObject` with `IfMatch: ifVersion`; otherwise the write is unconditional, through the SDK's multipart `Upload`. HTTP 412 or 409 on a conditional write throws the contract's `PreconditionFailedError`, whose message is `storage/precondition-failed: <bucket>/<name>: <reason>`, with the reason `object already exists` when `ifAbsent` was set, else `object changed since it was read`. Other errors propagate unchanged.

- Test: none yet
- Level: unit, contract
- State: new (no RFC yet)

#### OBJ-7 · Moving and deleting an object

`moveObject(ref, newName)` sends `CopyObject` to `newName` in the same bucket, with `CopySource` `<bucket>/<encodeURIComponent(name)>`, then `DeleteObject` of the original. `deleteObject(ref)` sends `DeleteObject`; deleting a missing object is not an error, as S3 answers it with success. Errors propagate unchanged, and a failed copy deletes nothing.

- Test: none yet
- Level: unit, contract
- State: new (no RFC yet)

#### OBJ-8 · Listing one level

`listDirectory({ bucket, name }, { limit?, startAfter? })` sends one `ListObjectsV2` with `Prefix: name`, `Delimiter: '/'`, `MaxKeys: limit` and `StartAfter: startAfter`, each only when given, and does not follow continuation tokens. `files` excludes objects whose name ends in `.folderPlaceholder` and the object named exactly `name`. Each file has `name`, `size` (bytes, `0` when absent) and `lastModified`. `directories` are the returned common prefixes other than `name`, as `{ bucket, name }` references, also when there are no files. `name` is used as given.

- Test: none yet
- Level: unit, contract
- State: new (no RFC yet)

#### OBJ-9 · Creating a directory

`createDirectory({ bucket, name })` writes an empty object `<name>/.folderPlaceholder` with `PutObject`, without reading anything first.

- Test: none yet
- Level: unit, contract
- State: new (no RFC yet)

#### OBJ-10 · Deleting a directory

`deleteDirectory({ bucket, name })` lists every object whose name starts with `name`, at every depth, following continuation tokens, and deletes them with `DeleteObjects`, at most 1000 keys per request. A key the response reports in `Errors` throws `storage/delete-failed: <bucket>/<key>: <code>` after the request; other errors propagate unchanged. A failure part-way leaves the directory partly deleted.

- Test: none yet
- Level: unit, contract
- State: new (no RFC yet)

#### OBJ-11 · Moving a directory

`moveDirectory({ bucket, name }, newName)` moves, as OBJ-7 does, every object whose name starts with `name`, at every depth, to `newName` followed by the rest of its name after `name`. It lists them first, following continuation tokens, and stops at the first failure, which propagates unchanged and leaves the directory partly moved.

- Test: none yet
- Level: unit, contract
- State: new (no RFC yet)
