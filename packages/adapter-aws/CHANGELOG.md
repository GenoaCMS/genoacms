# @genoacms/adapter-aws

## 0.8.0

### Minor Changes

- [#22](https://github.com/GenoaCMS/genoacms/pull/22) [`813d2b5`](https://github.com/GenoaCMS/genoacms/commit/813d2b5ec6841e155cd697e45dccdb42e7f9c3d0) Thanks [@Hejtmus](https://github.com/Hejtmus)! - The storage contract gains `ObjectNotFoundError`: reading or deleting a missing object rejects with `storage/not-found` on every adapter. A directory's name is `''` or ends in `/`, and other names are refused with `storage/not-a-directory`. Listings page with an opaque `next` token, and core and `genoa database` follow every page. `gzip` is removed from `UploadOptions`. The MinIO adapter now serves any S3-compatible server that honours conditional writes (tested against RustFS), and the conformance suite checks the whole storage contract.

### Patch Changes

- Updated dependencies [[`813d2b5`](https://github.com/GenoaCMS/genoacms/commit/813d2b5ec6841e155cd697e45dccdb42e7f9c3d0)]:
  - @genoacms/contracts@0.0.3

## 0.7.0

### Minor Changes

- [#11](https://github.com/GenoaCMS/genoacms/pull/11) [`5e3fbd3`](https://github.com/GenoaCMS/genoacms/commit/5e3fbd3f21e41d61ebd847097591a8fca0498e70) Thanks [@Hejtmus](https://github.com/Hejtmus)! - Brings the AWS adapter to its Specification (RFC-0026): the missing storage methods, merging DynamoDB updates and paged collections, a Secrets Manager secrets provider, and a Lambda deploy behind the Lambda Web Adapter and a function URL. The `aws` target no longer takes `accountId`, and `role` must be an IAM role ARN.

### Patch Changes

- Updated dependencies [[`f85e6ae`](https://github.com/GenoaCMS/genoacms/commit/f85e6ae53a0f23e2cd77291b4527cd1b753138f8)]:
  - @genoacms/contracts@0.0.2
