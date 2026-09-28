# GCP storage: Cloud Storage

Part of the [GCP adapter architecture](README.md). Markers and IDs as defined there.

## 1. Role

`@genoacms/adapter-gcp/storage` serves GenoaCMS buckets from Cloud Storage. A provider serves the
buckets the config assigns to it (`configuration.md` §5.5). Options: `projectId`, and `credentials?`,
which production omits (README GU2).

## 2. Behavior (current)

- **Registered buckets only.** The runtime receives its bucket names from the host (`ctx.resources`). Any other name throws `bucket-unregistered` before a request is made, so a reference cannot reach a bucket the config does not name.
- **Versions are GCS generations.** `getObject` reads the object's generation with one metadata call and returns it as `version`. `uploadObject` maps `ifVersion` to `ifGenerationMatch` and `ifAbsent` to `ifGenerationMatch: 0`, which is an atomic create. HTTP 412 becomes the contract's `PreconditionFailedError`. If the metadata call fails, the download still succeeds without a version, and only a conditional write becomes impossible.
- **Directories are prefixes.** `listDirectory` lists one level (delimiter `/`) with paging (`limit`, `startAfter`). `createDirectory` writes a `<name>/.folderPlaceholder` object, which listings hide.
- **URLs.** `getPublicURL` returns the object's public URL. It works only if the bucket or object is publicly readable, which is the operator's bucket configuration: core's `genoacms-public` bucket, for example. `getSignedURL` signs a read URL with an expiry.

| # | Finding | Where |
| :-- | :-- | :-- |
| GF8 | **Signed URLs under ADC need `signBlob`.** Without a key, the client library signs through the IAM Credentials API as the runtime identity, which needs `iam.serviceAccounts.signBlob` on itself (README §4). Whether the default compute account holds it depends on the project's grants; GS3 checks it. Core's storage browser uses signed URLs, so without the grant, file previews and downloads fail while everything else works. | `src/storage/runtime.ts`, `getSignedURL`; core `storage.server.ts` |
| GF10 | **Directory operations are unbounded and not atomic.** `deleteDirectory` and `moveDirectory` list the whole prefix and then act on every object at once, in parallel. A large directory issues that many requests simultaneously, and a failure part-way leaves it half moved or half deleted. | `src/storage/runtime.ts` |

GF8 is addressed by documentation (README §4) and verified by GS3. GF10 is open: no decision yet.

## 3. History

*History.* Storage was the adapter's first service (2023-10). The directory-listing format changed in
2025-03 to the current `files` and `directories` shape. Generation preconditions were added on
2026-08-16 for core's optimistic concurrency. RFC-0007 moved the bodies into the runtime unchanged,
apart from the bucket check, which now uses the host's resource list instead of reading the config.

## 4. Verification

**GS3, for GF8: not run.** On the live instance, open a file in the storage browser with the
runtime identity lacking `roles/iam.serviceAccountTokenCreator` on itself, then with it. Expected:
the first fails with a permission error naming `signBlob`, the second previews the file.

The contract itself is covered by the opt-in conformance suite (`test/conformance.test.ts`,
`GENOACMS_TEST_GCP=1`), which runs against a real bucket with the operator's ADC.
