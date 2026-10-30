# @genoacms/sveltekit-adapter-cloud-run-functions

## 2.0.0

### Major Changes

- [`71a947c`](https://github.com/GenoaCMS/genoacms/commit/71a947c32e019353da45514c80a1ecae813fe50a) Thanks [@Hejtmus](https://github.com/Hejtmus)! - SvelteKit 3 (RFC-0043). Core runs on SvelteKit 3.1, Vite 8 and Node 22.17 or later, and the origin is fixed at build time on every target: a deployment descriptor's `origin(options)` becomes SvelteKit's `paths.origin`, and no deploy sets an `ORIGIN` variable. `@genoacms/config/load` exports `resolveKitTarget`, which returns the adapter and the origin, in place of `resolveKitAdapter`. The Cloud Run Functions adapter 2.0.0 requires SvelteKit 3, bundles in SvelteKit's own server build, installs no polyfills, and refuses to start when `ORIGIN` is set; set `paths.origin` instead. adapter-gcp, adapter-aws and adapter-node require `@sveltejs/adapter-node` 6. Conformance accepts Vitest 4.

## 1.0.1

### Patch Changes

- [#13](https://github.com/GenoaCMS/genoacms/pull/13) [`63891bd`](https://github.com/GenoaCMS/genoacms/commit/63891bd51e5483c417ae8b6e0397a225d04a9cbc) Thanks [@Hejtmus](https://github.com/Hejtmus)! - Fix the open GCP findings (RFC-0027): directory deletes and moves are bounded and stop at the first failure, `startAfter` is exclusive, a directory move takes its new name literally, the deploy sets `IGNORED_ROUTES` so `/favicon.ico` and `/robots.txt` reach the app, and the dead `static/` middleware is gone.

## 0.0.1

- Initial release
