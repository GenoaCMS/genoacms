# @genoacms/conformance

## 0.0.3

### Patch Changes

- [#22](https://github.com/GenoaCMS/genoacms/pull/22) [`813d2b5`](https://github.com/GenoaCMS/genoacms/commit/813d2b5ec6841e155cd697e45dccdb42e7f9c3d0) Thanks [@Hejtmus](https://github.com/Hejtmus)! - The storage contract gains `ObjectNotFoundError`: reading or deleting a missing object rejects with `storage/not-found` on every adapter. A directory's name is `''` or ends in `/`, and other names are refused with `storage/not-a-directory`. Listings page with an opaque `next` token, and core and `genoa database` follow every page. `gzip` is removed from `UploadOptions`. The MinIO adapter now serves any S3-compatible server that honours conditional writes (tested against RustFS), and the conformance suite checks the whole storage contract.

- Updated dependencies [[`813d2b5`](https://github.com/GenoaCMS/genoacms/commit/813d2b5ec6841e155cd697e45dccdb42e7f9c3d0)]:
  - @genoacms/contracts@0.0.3

## 0.0.2

### Patch Changes

- [`f22136c`](https://github.com/GenoaCMS/genoacms/commit/f22136c2278df5010392fb95d99c55f709bd3418) Thanks [@Hejtmus](https://github.com/Hejtmus)! - The storage suite's read test awaits the object's stream and checks its content, instead of returning before the read; the read no longer races the next test's delete into an uncaught 404.

- Updated dependencies [[`f85e6ae`](https://github.com/GenoaCMS/genoacms/commit/f85e6ae53a0f23e2cd77291b4527cd1b753138f8)]:
  - @genoacms/contracts@0.0.2
