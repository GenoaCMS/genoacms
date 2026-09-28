# GCP storage: Cloud Storage

Part of the [GCP adapter architecture](README.md). Markers, IDs and test references as defined there.
Statement code: `STO`.

# Design

## 1. Role

`@genoacms/adapter-gcp/storage` serves GenoaCMS buckets from Cloud Storage. A provider serves the
buckets the config assigns to it (`configuration.md` §5.5), and core's storage browser, media fields
and publication all go through it.

## 2. Decisions

**Versions are GCS generations (STO-4, STO-6).** Core's optimistic concurrency needs a token that
changes on every write and a conditional write on it. GCS generations are exactly that, and
`ifGenerationMatch: 0` is GCS's atomic create, so no extra metadata is stored.

**A missing generation does not fail a download (STO-4).** The generation costs a metadata call,
because the read stream is returned before the response is seen. If that call fails, the download
still proceeds without a version. Only a later conditional write becomes impossible.

**Directories are prefixes with a placeholder object (STO-9, STO-10).** GCS has no directories. An
empty directory would not exist, so `createDirectory` writes a hidden placeholder that listings
filter out.

## 3. Findings

| # | Finding | State |
| :-- | :-- | :-- |
| GF8 | **Signed URLs under ADC need `signBlob`** (STO-8). Without a key, the client library signs through the IAM Credentials API as the runtime identity, which needs `iam.serviceAccounts.signBlob` on itself (README §4). Core's storage browser uses signed URLs, so without the grant file previews and downloads fail while everything else works. Whether the default compute account holds it depends on the project's grants. | documented; GS3 not run |
| GF10 | **Directory operations are unbounded and not atomic** (STO-11, STO-12). They list the whole prefix and act on every object at once, in parallel. A large directory issues that many requests simultaneously, and a failure part-way leaves it half moved or half deleted. | open |
| GF12 | **Most of the runtime is untested.** STO-5 to STO-12 have no unit test, and the opt-in conformance suite covers only upload, read, list and delete. Conditional writes (STO-6), the precondition mapping and directory handling are verified by nothing. | decided: README GD6, RFC-0024 |

## 4. History

*History.* Storage was the adapter's first service (2023-10). The directory-listing format changed in
2025-03 to the current `files` and `directories` shape. Generation preconditions were added on
2026-08-16 for core's optimistic concurrency. RFC-0007 moved the bodies into the runtime unchanged,
except the bucket check, which now uses the host's resource list instead of reading the config.

## 5. Verification

- **GS3, for GF8: not run.** On the live instance, open a file in the storage browser with the runtime identity lacking `roles/iam.serviceAccountTokenCreator` on itself, then with it. Expected: the first fails with a permission error naming `signBlob`, the second previews the file.
- The opt-in conformance suite (`test/conformance.test.ts`, `GENOACMS_TEST_GCP=1`, with the operator's ADC and `GENOACMS_TEST_GCP_BUCKET`, `GENOACMS_TEST_GCP_PROJECT`) runs `@genoacms/conformance`'s storage cases against a real bucket.

# Specification

## S1. Descriptor

| # | Statement | Test |
| :-- | :-- | :-- |
| STO-1 | Specifier `@genoacms/adapter-gcp/storage`, kind `storage`. Runtime specifier `@genoacms/adapter-gcp/storage/runtime`. Options `projectId: string` (required) and `credentials?: Secret<ServiceAccount>`, decoded as JSON. Validation follows COM-2 and COM-3. | `storage/descriptor.test.ts` › both cases |

## S2. Runtime

One `Storage({ projectId, credentials? })` client per provider (COM-4). The runtime receives its
bucket names in `ctx.resources`.

| # | Statement | Test |
| :-- | :-- | :-- |
| STO-2 | Without `credentials`, the client is constructed with `{ projectId }` only. | `storage/runtime.test.ts` › passes the project, and the credentials only when given |
| STO-3 | Every method first checks the reference's bucket against `ctx.resources`. An unlisted bucket throws `bucket-unregistered` before any request. | `storage/runtime.test.ts` › refuses a bucket outside its resources… |
| STO-4 | `getObject({ bucket, name })` returns `{ data, version }`: `data` is the object's read stream, and `version` is its generation as a decimal string. When the metadata call fails, `version` is `undefined` and the read still proceeds. | `storage/runtime.test.ts` › …reads a registered one with its generation; metadata failure unverified; conformance: getting uploaded object |
| STO-5 | `getPublicURL(ref)` returns `https://storage.googleapis.com/<bucket>/<encodeURIComponent(name)>`, so a `/` in the name appears as `%2F`. It does not check that the object is public: that is the bucket's configuration. | unverified |
| STO-6 | `uploadObject(ref, stream, options)`: `ifAbsent: true` writes with `ifGenerationMatch: 0`; otherwise `ifVersion` writes with `ifGenerationMatch: Number(ifVersion)`; otherwise the write is unconditional. The remaining options pass to the client's `save`. HTTP 412 throws the contract's `PreconditionFailedError`, whose message is `storage/precondition-failed: <bucket>/<name>: <reason>`, with the reason `object already exists` when `ifAbsent` was set, else `object changed since it was read`. Other errors propagate. | conformance: uploading an object (unconditional only); conditions unverified |
| STO-7 | `moveObject(ref, newName)` renames within the same bucket. `deleteObject(ref)` deletes. Errors propagate. | conformance: deleting uploaded object (delete only); move unverified |
| STO-8 | `getSignedURL(ref, expires)` returns a **V2**-signed read URL, the client library's default version: `https://storage.googleapis.com/<bucket>/<name>?GoogleAccessId=<account>&Expires=<unix seconds>&Signature=<base64>`, with `/` in the name kept. It is signed as the client's identity: locally with a key, through IAM `signBlob` under ADC (GF8). | unverified |
| STO-9 | `listDirectory({ bucket, name }, { limit?, startAfter? })` lists one level: prefix `name`, delimiter `/`, no automatic paging, at most `limit` results, starting after `startAfter`. `files` excludes objects whose name ends in `.folderPlaceholder` and the object named exactly `name`. Each file has `name`, `size` (bytes, `0` when unknown) and `lastModified` (the object's `updated` time). `directories` are the returned prefixes other than `name`, as `{ bucket, name }` references. | conformance: looking for uploaded object (presence only); the rest unverified |
| STO-10 | `createDirectory({ bucket, name })` writes an empty object `<name>/.folderPlaceholder`. | unverified |
| STO-11 | `deleteDirectory({ bucket, name })` deletes every object whose name starts with `name`, at every depth, in parallel. | unverified |
| STO-12 | `moveDirectory({ bucket, name }, newName)` moves every object whose name starts with `name`, at every depth, in parallel, to the name with the first occurrence of `name` replaced by `newName`. | unverified |
