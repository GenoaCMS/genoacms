# @genoacms/adapter-minio

## 0.9.0

### Minor Changes

- [`7a8ce2a`](https://github.com/GenoaCMS/genoacms/commit/7a8ce2a89b12bd7c99419456e27a670f555b79cb) Thanks [@Hejtmus](https://github.com/Hejtmus)! - Ported to the new config format (RFC-0006 to RFC-0010, RFC-0012, RFC-0014): each adapter exports a descriptor that `@genoacms/config` loads by package name from `genoa.config/`, and implements `@genoacms/contracts`. Configs written for `@genoacms/cloudabstraction` no longer load.

### Patch Changes

- Updated dependencies [[`f85e6ae`](https://github.com/GenoaCMS/genoacms/commit/f85e6ae53a0f23e2cd77291b4527cd1b753138f8)]:
  - @genoacms/contracts@0.0.2
