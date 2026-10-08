---
type: architecture
title: GCP storage: Cloud Storage
codes: [STO]
verified: aa17eb9
---

# GCP storage: Cloud Storage

Part of the [GCP adapter architecture](README.md). Markers, IDs and test references as defined there.

## Design

### Role

`@genoacms/adapter-gcp/storage` serves GenoaCMS buckets from Cloud Storage. A provider serves the
buckets the config assigns to it (`configuration.md`, *Types: the config and the manifest*), and core's storage browser, media fields
and publication all go through it.

### Decisions

**Versions are GCS generations (STO-4, STO-6).** Core's optimistic concurrency needs a token that
changes on every write and a conditional write on it. GCS generations are exactly that, and
`ifGenerationMatch: 0` is GCS's atomic create, so no extra metadata is stored.
*Cost:* a version costs a metadata call on every read (STO-4).

**A missing generation does not fail a download (STO-4).** The generation costs a metadata call,
because the read stream is returned before the response is seen. If that call fails, the download
still proceeds without a version. Only a later conditional write becomes impossible.
*Cost:* a caller that then writes unconditionally loses the protection it expected, without an error.

**Directories are prefixes with a placeholder object (STO-9, STO-10).** GCS has no directories. An
empty directory would not exist, so `createDirectory` writes a hidden placeholder that listings
filter out.
*Cost:* an object whose name ends in `.folderPlaceholder` is hidden from listings (STO-9).

**GD7. Directory operations are bounded and stop at the first failure (GU8; STO-11, STO-12;
GF10).** A directory delete lists page by page and deletes at most 10 objects at a time; a directory
move lists the whole prefix first and then moves one object at a time. The first failure ends the
operation with its error.
*Why:* acting on every object at once issues as many requests as the directory holds, and a failure
part-way let every other request go on. GCS has no atomic operation on a prefix, so a bound and an
early stop are what can be had: a failure leaves less behind, and the error says where. A move lists
first because a move into its own subtree (`d/` to `d/x/`) would otherwise list the objects it has
just moved. The AWS adapter behaves the same (`adapter-aws/storage.md` OBJ-10, OBJ-11).
*Cost:* a large directory takes longer, a move most of all. A failure still leaves the directory
partly deleted or partly moved, now up to the failing object, and the operation is not resumed.

### Findings

| # | Finding | State |
| :-- | :-- | :-- |
| GF8 | **Signed URLs under ADC need `signBlob`** (STO-8). Without a key, the client library signs through the IAM Credentials API as the runtime identity, which needs `iam.serviceAccounts.signBlob` on itself (README, IAM). Core's storage browser uses signed URLs, so without the grant file previews and downloads fail while everything else works. Whether the default compute account holds it depends on the project's grants. | documented; GS3 not run |
| GF10 | **Directory operations are unbounded and not atomic** (STO-11, STO-12). They list the whole prefix and act on every object at once, in parallel. A large directory issues that many requests simultaneously, and a failure part-way leaves it half moved or half deleted. GD7 bounds them and stops at the first failure; atomicity stays out of reach. | fixed, RFC-0027 |
| GF12 | *History.* **Most of the runtime was untested.** STO-5 to STO-12 had no unit test, and the opt-in conformance suite covers only upload, read, list and delete. Conditional writes (STO-6), the precondition mapping and directory handling were verified by nothing. | fixed, RFC-0024 |
| GF15 | *History.* **Most storage statements have no contract test** (STO-6 to STO-12). Their level includes `contract`, but the GCP conformance run carries only STO-4, and `@genoacms/conformance` covers only upload, read, list and delete. Preconditions, moves, directories and signed URLs (GS3) are checked only against a mocked SDK. Until they exist, the results checker fails on every push to `main`, which is therefore not releasable (author, 2026-09-28: the level is kept, not lowered). | fixed, RFC-0025 |
| GF21 | **`startAfter` is inclusive** (STO-9). The runtime passes it to GCS as `startOffset`, which lists from the named object on, so the next page repeats the object named `startAfter`, while STO-9 starts after it. Found by RFC-0025's contract test (2026-09-30). Core passes no `startAfter`, so no user meets it today. | fixed, RFC-0027 |
| GF22 | **A directory moved to a name containing `$` patterns gets wrong object names** (STO-12). The new name is used as a replacement string, so `$&`, `` $` ``, `$'` and `$$` are expanded: moving `d/` to `n$&/` names `d/x` as `nd//x`. Found by GS6. | fixed, RFC-0027 |
| GF29 | **The client library's `deleteFiles` does not stop at the first failure** (STO-11, GS8). RFC-0027 first used `bucket.deleteFiles({ prefix })` of `@google-cloud/storage` 7.21 for GD7. It queues up to 1000 deletes before awaiting any, so a failed delete leaves the queued ones running; and while the listing is still streaming it rejects with `Premature close` and leaves the delete's own error as an unhandled rejection, which ends a Node process. Found before release; the runtime lists and deletes page by page itself. | fixed, RFC-0027 |
| GF24 | **The storage tests miss parts of their statements** (GS6). Tests pass when: a non-string `projectId` is accepted (COM-3); `ifVersion` wins over `ifAbsent`, or a non-412 error on a conditional write becomes `PreconditionFailedError` (STO-6); `deleteObject` swallows its errors (STO-7); the URL is signed for `write` (STO-8, unit level); any name containing `.folderPlaceholder` is hidden (STO-9); one failed delete or move is ignored (STO-11, STO-12). STO-11 and STO-12 also said "in parallel", which no test and no user can observe; GD7 replaced it. | fixed, RFC-0027 |
| GF37 | **STO-3 is tested through `getObject` only** (GS14). A runtime in which any of the other nine methods skips the bucket check, or checks after its first request, passes every test. Found 2026-10-08 by GS14. | open, RFC-0033 |

### History

*History.* Storage was the adapter's first service (2023-10). The directory-listing format changed in
2025-03 to the current `files` and `directories` shape. Generation preconditions were added on
2026-08-16 for core's optimistic concurrency. RFC-0007 moved the bodies into the runtime unchanged,
except the bucket check, which now uses the host's resource list instead of reading the config.
RFC-0027 (2026-10-01) made `startAfter` exclusive, bounded the directory operations and stopped
them at the first failure (GD7), and took a moved directory's new name literally.

### Verification

- **GS3, for GF8: not run.** On the live instance, open a file in the storage browser with the runtime identity lacking `roles/iam.serviceAccountTokenCreator` on itself, then with it. Expected: the first fails with a permission error naming `signBlob`, the second previews the file.
- The opt-in conformance suite (`test/conformance.test.ts`, `GENOACMS_TEST_GCP=1`, with the operator's ADC and `GENOACMS_TEST_GCP_BUCKET`, `GENOACMS_TEST_GCP_PROJECT`) runs `@genoacms/conformance`'s storage cases against a real bucket.

## Specification

### Descriptor

#### STO-1 · Descriptor

Specifier `@genoacms/adapter-gcp/storage`, kind `storage`. Runtime specifier `@genoacms/adapter-gcp/storage/runtime`. Options `projectId: string` (required) and `credentials?: Secret<ServiceAccount>`, decoded as JSON. Validation follows COM-2 and COM-3.

- Test: `packages/adapter-gcp/src/storage/descriptor.test.ts`
- Level: unit

### Runtime

One `Storage({ projectId, credentials? })` client per provider (COM-4). The runtime receives its
bucket names in `ctx.resources`.

#### STO-2 · ADC without credentials

Without `credentials`, the client is constructed with `{ projectId }` only.

- Test: `packages/adapter-gcp/src/storage/runtime.test.ts`
- Level: unit

#### STO-3 · Only registered buckets

Every method first checks the reference's bucket against `ctx.resources`. An unlisted bucket throws `bucket-unregistered` before any request.

- Test: `packages/adapter-gcp/src/storage/runtime.test.ts`
- Level: unit

#### STO-4 · Reads return the generation

`getObject({ bucket, name })` returns `{ data, version }`: `data` is the object's read stream, and `version` is its generation as a decimal string. When the metadata call fails, `version` is `undefined` and the read still proceeds.

- Test: `packages/adapter-gcp/src/storage/runtime.test.ts`, `packages/adapter-gcp/test/contract/storage.test.ts`, `packages/adapter-gcp/test/conformance.test.ts`
- Level: unit, contract

#### STO-5 · Public URL

`getPublicURL(ref)` returns `https://storage.googleapis.com/<bucket>/<encodeURIComponent(name)>`, so a `/` in the name appears as `%2F`. It does not check that the object is public: that is the bucket's configuration.

- Test: `packages/adapter-gcp/src/storage/urls.test.ts`
- Level: unit

#### STO-6 · Conditional writes

`uploadObject(ref, stream, options)`: `ifAbsent: true` writes with `ifGenerationMatch: 0`; otherwise `ifVersion` writes with `ifGenerationMatch: Number(ifVersion)`; otherwise the write is unconditional. The remaining options pass to the client's `save`. HTTP 412 throws the contract's `PreconditionFailedError`, whose message is `storage/precondition-failed: <bucket>/<name>: <reason>`, with the reason `object already exists` when `ifAbsent` was set, else `object changed since it was read`. Other errors propagate.

- Test: `packages/adapter-gcp/src/storage/runtime.test.ts`, `packages/adapter-gcp/test/contract/storage.test.ts`
- Level: unit, contract

#### STO-7 · Moving and deleting an object

`moveObject(ref, newName)` renames within the same bucket. `deleteObject(ref)` deletes. Errors propagate.

- Test: `packages/adapter-gcp/src/storage/runtime.test.ts`, `packages/adapter-gcp/test/contract/storage.test.ts`
- Level: unit, contract

#### STO-8 · Signed URL

`getSignedURL(ref, expires)` returns a **V2**-signed read URL, the client library's default version: `https://storage.googleapis.com/<bucket>/<name>?GoogleAccessId=<account>&Expires=<floor(expires / 1000)>&Signature=<base64>`, with `/` in the name kept. It is signed as the client's identity: locally with a key, through IAM `signBlob` under ADC (GF8).

- Test: `packages/adapter-gcp/src/storage/urls.test.ts`, `packages/adapter-gcp/test/contract/storage.test.ts` (unverified: the `signBlob` path under ADC, GS3)
- Level: unit, contract

#### STO-9 · Listing one level

`listDirectory({ bucket, name }, { limit?, startAfter? })` lists one level: prefix `name`, delimiter `/`, no automatic paging, at most `limit` results, files and directories together: when more come back, the first `limit` in GCS's order, by the UTF-8 bytes of the name, are kept, and `limit: 0` lists nothing. It starts after `startAfter`: an object or prefix named exactly `startAfter` is not listed and does not count toward `limit` (GF21). `files` excludes objects whose name ends in `.folderPlaceholder` and the object named exactly `name`. Each file has `name`, `size` (bytes, `0` when unknown) and `lastModified` (the object's `updated` time). `directories` are the returned prefixes other than `name`, as `{ bucket, name }` references.

- Test: `packages/adapter-gcp/src/storage/runtime.test.ts`, `packages/adapter-gcp/test/contract/storage.test.ts`
- Level: unit, contract

#### STO-10 · Creating a directory

`createDirectory({ bucket, name })` writes an empty object `<name>/.folderPlaceholder`.

- Test: `packages/adapter-gcp/src/storage/runtime.test.ts`, `packages/adapter-gcp/test/contract/storage.test.ts`
- Level: unit, contract

#### STO-11 · Deleting a directory

`deleteDirectory({ bucket, name })` deletes every object whose name starts with `name`, at every depth. It lists them page by page, lists a page only after every delete of the previous one has ended, and has at most 10 deletes in flight (GD7). After the first failed delete no further delete starts and no further page is listed; once the deletes already started have ended, it rejects with that first error. A listing error of any page rejects with that error likewise. An empty page that has a next page does not end the listing (GF29).

- Test: `packages/adapter-gcp/src/storage/runtime.test.ts`, `packages/adapter-gcp/test/contract/storage.test.ts`
- Level: unit, contract

#### STO-12 · Moving a directory

`moveDirectory({ bucket, name }, newName)` first lists every object whose name starts with `name`, at every depth and placeholders included, across all pages, then moves them one at a time, in name order as GCS lists them (GD7). Each moves to `newName` followed by the rest of its name after the leading `name`, taken literally (GF22). The first failed move rejects with that error, and no further object is moved.

- Test: `packages/adapter-gcp/src/storage/runtime.test.ts`, `packages/adapter-gcp/test/contract/storage.test.ts`
- Level: unit, contract
