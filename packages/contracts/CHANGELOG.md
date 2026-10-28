# @genoacms/contracts

## 0.0.3

### Patch Changes

- [#22](https://github.com/GenoaCMS/genoacms/pull/22) [`813d2b5`](https://github.com/GenoaCMS/genoacms/commit/813d2b5ec6841e155cd697e45dccdb42e7f9c3d0) Thanks [@Hejtmus](https://github.com/Hejtmus)! - The storage contract gains `ObjectNotFoundError`: reading or deleting a missing object rejects with `storage/not-found` on every adapter. A directory's name is `''` or ends in `/`, and other names are refused with `storage/not-a-directory`. Listings page with an opaque `next` token, and core and `genoa database` follow every page. `gzip` is removed from `UploadOptions`. The MinIO adapter now serves any S3-compatible server that honours conditional writes (tested against RustFS), and the conformance suite checks the whole storage contract.

## 0.0.2

### Patch Changes

- [#18](https://github.com/GenoaCMS/genoacms/pull/18) [`f85e6ae`](https://github.com/GenoaCMS/genoacms/commit/f85e6ae53a0f23e2cd77291b4527cd1b753138f8) Thanks [@Hejtmus](https://github.com/Hejtmus)! - A collection's `schema` and `primaryKey.schema` are typed by the contract's own `JsonSchema`, a structural JSON Schema object, instead of ajv's `JSONSchemaType<any>`, which refused every ordinary schema. The contract no longer refers to ajv.
