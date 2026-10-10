# @genoacms/sveltekit-adapter-cloud-run-functions

## 1.0.1

### Patch Changes

- [#13](https://github.com/GenoaCMS/genoacms/pull/13) [`63891bd`](https://github.com/GenoaCMS/genoacms/commit/63891bd51e5483c417ae8b6e0397a225d04a9cbc) Thanks [@Hejtmus](https://github.com/Hejtmus)! - Fix the open GCP findings (RFC-0027): directory deletes and moves are bounded and stop at the first failure, `startAfter` is exclusive, a directory move takes its new name literally, the deploy sets `IGNORED_ROUTES` so `/favicon.ico` and `/robots.txt` reach the app, and the dead `static/` middleware is gone.

## 0.0.1

- Initial release
