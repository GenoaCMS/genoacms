# @genoacms/adapter-gcp

## 0.9.0

### Minor Changes

- [`7a8ce2a`](https://github.com/GenoaCMS/genoacms/commit/7a8ce2a89b12bd7c99419456e27a670f555b79cb) Thanks [@Hejtmus](https://github.com/Hejtmus)! - Ported to the new config format (RFC-0006 to RFC-0010, RFC-0012, RFC-0014): each adapter exports a descriptor that `@genoacms/config` loads by package name from `genoa.config/`, and implements `@genoacms/contracts`. Configs written for `@genoacms/cloudabstraction` no longer load.

### Patch Changes

- [#13](https://github.com/GenoaCMS/genoacms/pull/13) [`63891bd`](https://github.com/GenoaCMS/genoacms/commit/63891bd51e5483c417ae8b6e0397a225d04a9cbc) Thanks [@Hejtmus](https://github.com/Hejtmus)! - Fix the open GCP findings (RFC-0027): directory deletes and moves are bounded and stop at the first failure, `startAfter` is exclusive, a directory move takes its new name literally, the deploy sets `IGNORED_ROUTES` so `/favicon.ico` and `/robots.txt` reach the app, and the dead `static/` middleware is gone.

- Updated dependencies [[`f85e6ae`](https://github.com/GenoaCMS/genoacms/commit/f85e6ae53a0f23e2cd77291b4527cd1b753138f8), [`63891bd`](https://github.com/GenoaCMS/genoacms/commit/63891bd51e5483c417ae8b6e0397a225d04a9cbc)]:
  - @genoacms/contracts@0.0.2
  - @genoacms/sveltekit-adapter-cloud-run-functions@1.0.1
