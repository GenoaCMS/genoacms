---
'@genoacms/contracts': patch
'@genoacms/conformance': patch
'@genoacms/adapter-gcp': minor
'@genoacms/adapter-aws': minor
'@genoacms/adapter-minio': minor
'@genoacms/core': minor
'@genoacms/cli': patch
---

The storage contract gains `ObjectNotFoundError`: reading or deleting a missing object rejects with `storage/not-found` on every adapter. A directory's name is `''` or ends in `/`, and other names are refused with `storage/not-a-directory`. Listings page with an opaque `next` token, and core and `genoa database` follow every page. `gzip` is removed from `UploadOptions`. The MinIO adapter now serves any S3-compatible server that honours conditional writes (tested against RustFS), and the conformance suite checks the whole storage contract.
