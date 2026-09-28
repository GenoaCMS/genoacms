---
type: architecture
title: GCP storage: Cloud Storage
codes: [STO]
verified: b050b3b
---

# GCP storage: Cloud Storage

Part of the [GCP adapter architecture](README.md). Markers, IDs and test references as defined there.

## Design

### Role

`@genoacms/adapter-gcp/storage` serves GenoaCMS buckets from Cloud Storage. A provider serves the
buckets the config assigns to it (`configuration.md` §5.5), and core's storage browser, media fields
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

### Findings

| # | Finding | State |
| :-- | :-- | :-- |
| GF8 | **Signed URLs under ADC need `signBlob`** (STO-8). Without a key, the client library signs through the IAM Credentials API as the runtime identity, which needs `iam.serviceAccounts.signBlob` on itself (README, IAM). Core's storage browser uses signed URLs, so without the grant file previews and downloads fail while everything else works. Whether the default compute account holds it depends on the project's grants. | documented; GS3 not run |
| GF10 | **Directory operations are unbounded and not atomic** (STO-11, STO-12). They list the whole prefix and act on every object at once, in parallel. A large directory issues that many requests simultaneously, and a failure part-way leaves it half moved or half deleted. | open |
| GF12 | *History.* **Most of the runtime was untested.** STO-5 to STO-12 had no unit test, and the opt-in conformance suite covers only upload, read, list and delete. Conditional writes (STO-6), the precondition mapping and directory handling were verified by nothing. | fixed, RFC-0024 |
| GF15 | **Most storage statements have no contract test** (STO-6 to STO-12). Their level includes `contract`, but the GCP conformance run carries only STO-4, and `@genoacms/conformance` covers only upload, read, list and delete. Preconditions, moves, directories and signed URLs (GS3) are checked only against a mocked SDK. Until they exist, the results checker fails on every push to `main`, which is therefore not releasable (author, 2026-09-28: the level is kept, not lowered). | open |

### History

*History.* Storage was the adapter's first service (2023-10). The directory-listing format changed in
2025-03 to the current `files` and `directories` shape. Generation preconditions were added on
2026-08-16 for core's optimistic concurrency. RFC-0007 moved the bodies into the runtime unchanged,
except the bucket check, which now uses the host's resource list instead of reading the config.

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

- Test: `packages/adapter-gcp/src/storage/runtime.test.ts`, `packages/adapter-gcp/test/conformance.test.ts`
- Level: unit, contract

#### STO-5 · Public URL

`getPublicURL(ref)` returns `https://storage.googleapis.com/<bucket>/<encodeURIComponent(name)>`, so a `/` in the name appears as `%2F`. It does not check that the object is public: that is the bucket's configuration.

- Test: `packages/adapter-gcp/src/storage/urls.test.ts`
- Level: unit

#### STO-6 · Conditional writes

`uploadObject(ref, stream, options)`: `ifAbsent: true` writes with `ifGenerationMatch: 0`; otherwise `ifVersion` writes with `ifGenerationMatch: Number(ifVersion)`; otherwise the write is unconditional. The remaining options pass to the client's `save`. HTTP 412 throws the contract's `PreconditionFailedError`, whose message is `storage/precondition-failed: <bucket>/<name>: <reason>`, with the reason `object already exists` when `ifAbsent` was set, else `object changed since it was read`. Other errors propagate.

- Test: `packages/adapter-gcp/src/storage/runtime.test.ts`
- Level: unit, contract

#### STO-7 · Moving and deleting an object

`moveObject(ref, newName)` renames within the same bucket. `deleteObject(ref)` deletes. Errors propagate.

- Test: `packages/adapter-gcp/src/storage/runtime.test.ts`
- Level: unit, contract

#### STO-8 · Signed URL

`getSignedURL(ref, expires)` returns a **V2**-signed read URL, the client library's default version: `https://storage.googleapis.com/<bucket>/<name>?GoogleAccessId=<account>&Expires=<floor(expires / 1000)>&Signature=<base64>`, with `/` in the name kept. It is signed as the client's identity: locally with a key, through IAM `signBlob` under ADC (GF8).

- Test: `packages/adapter-gcp/src/storage/urls.test.ts` (unverified: the `signBlob` path under ADC, GS3)
- Level: unit, contract

#### STO-9 · Listing one level

`listDirectory({ bucket, name }, { limit?, startAfter? })` lists one level: prefix `name`, delimiter `/`, no automatic paging, at most `limit` results, starting after `startAfter`. `files` excludes objects whose name ends in `.folderPlaceholder` and the object named exactly `name`. Each file has `name`, `size` (bytes, `0` when unknown) and `lastModified` (the object's `updated` time). `directories` are the returned prefixes other than `name`, as `{ bucket, name }` references.

- Test: `packages/adapter-gcp/src/storage/runtime.test.ts`
- Level: unit, contract

#### STO-10 · Creating a directory

`createDirectory({ bucket, name })` writes an empty object `<name>/.folderPlaceholder`.

- Test: `packages/adapter-gcp/src/storage/runtime.test.ts`
- Level: unit, contract

#### STO-11 · Deleting a directory

`deleteDirectory({ bucket, name })` deletes every object whose name starts with `name`, at every depth, in parallel.

- Test: `packages/adapter-gcp/src/storage/runtime.test.ts`
- Level: unit, contract

#### STO-12 · Moving a directory

`moveDirectory({ bucket, name }, newName)` moves every object whose name starts with `name`, at every depth, in parallel, to the name with the first occurrence of `name` replaced by `newName`.

- Test: `packages/adapter-gcp/src/storage/runtime.test.ts`
- Level: unit, contract
