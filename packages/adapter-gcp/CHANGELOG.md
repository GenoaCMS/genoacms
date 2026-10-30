# @genoacms/adapter-gcp

## 0.12.0

### Minor Changes

- [`71a947c`](https://github.com/GenoaCMS/genoacms/commit/71a947c32e019353da45514c80a1ecae813fe50a) Thanks [@Hejtmus](https://github.com/Hejtmus)! - SvelteKit 3 (RFC-0043). Core runs on SvelteKit 3.1, Vite 8 and Node 22.17 or later, and the origin is fixed at build time on every target: a deployment descriptor's `origin(options)` becomes SvelteKit's `paths.origin`, and no deploy sets an `ORIGIN` variable. `@genoacms/config/load` exports `resolveKitTarget`, which returns the adapter and the origin, in place of `resolveKitAdapter`. The Cloud Run Functions adapter 2.0.0 requires SvelteKit 3, bundles in SvelteKit's own server build, installs no polyfills, and refuses to start when `ORIGIN` is set; set `paths.origin` instead. adapter-gcp, adapter-aws and adapter-node require `@sveltejs/adapter-node` 6. Conformance accepts Vitest 4.

### Patch Changes

- Updated dependencies [[`71a947c`](https://github.com/GenoaCMS/genoacms/commit/71a947c32e019353da45514c80a1ecae813fe50a)]:
  - @genoacms/sveltekit-adapter-cloud-run-functions@2.0.0
  - @genoacms/contracts@0.2.0

## 0.11.0

### Minor Changes

- [#25](https://github.com/GenoaCMS/genoacms/pull/25) [`eeabe19`](https://github.com/GenoaCMS/genoacms/commit/eeabe19499974018fc510f84da7e18a7b6b79cf1) Thanks [@Hejtmus](https://github.com/Hejtmus)! - The database contract's audit findings (RFC-0042). Documents hold only values every store can hold: well-formed strings without U+0000, numbers of 0 or magnitude 1e-130 to 1e126, no array directly inside an array, no sparse array and no circular reference. The key field is ignored before any check, also when `undefined`. An ID a store cannot hold reads as absent and deleting it sends no request. Query parameters are checked strictly (`limit` at most 1000, no unknown keys), and Firestore refuses a page token that does not fit the query, DynamoDB and Postgres one that is not their kind of ID. Postgres quotes field names literally and answers an empty page for a field with no column; DynamoDB no longer sends an empty `ExpressionAttributeValues`.

- [#25](https://github.com/GenoaCMS/genoacms/pull/25) [`9b97ef1`](https://github.com/GenoaCMS/genoacms/commit/9b97ef12e59d47c8a043996a4966d91e3f271b3e) Thanks [@Hejtmus](https://github.com/Hejtmus)! - The database contract (RFC-0042). `getCollection` returns a page, `{ documents, next }`, and filters with typed comparison conditions (`==`, `!=`, `<`, `<=`, `>`, `>=`) compared by JSON type, strings by their UTF-8 bytes. The store assigns every ID, the key is a read-only field of `data` equal to the ID, updating a missing document throws `DocumentNotFoundError`, and a value that is not JSON is refused before any request. `@genoacms/contracts/database` exports the errors and `isDocumentNotFound`, and `@genoacms/contracts/database/query` the helpers adapters share. Breaking for database adapters: `QueryParams` and `getCollection`'s result change, and Firestore and DynamoDB documents now carry the key field in `data`. `runDatabaseConformance` takes `{ collection, prefix }`.

### Patch Changes

- Updated dependencies [[`eeabe19`](https://github.com/GenoaCMS/genoacms/commit/eeabe19499974018fc510f84da7e18a7b6b79cf1), [`9b97ef1`](https://github.com/GenoaCMS/genoacms/commit/9b97ef12e59d47c8a043996a4966d91e3f271b3e)]:
  - @genoacms/contracts@0.1.0

## 0.10.0

### Minor Changes

- [#22](https://github.com/GenoaCMS/genoacms/pull/22) [`813d2b5`](https://github.com/GenoaCMS/genoacms/commit/813d2b5ec6841e155cd697e45dccdb42e7f9c3d0) Thanks [@Hejtmus](https://github.com/Hejtmus)! - The storage contract gains `ObjectNotFoundError`: reading or deleting a missing object rejects with `storage/not-found` on every adapter. A directory's name is `''` or ends in `/`, and other names are refused with `storage/not-a-directory`. Listings page with an opaque `next` token, and core and `genoa database` follow every page. `gzip` is removed from `UploadOptions`. The MinIO adapter now serves any S3-compatible server that honours conditional writes (tested against RustFS), and the conformance suite checks the whole storage contract.

### Patch Changes

- [#22](https://github.com/GenoaCMS/genoacms/pull/22) [`ef47543`](https://github.com/GenoaCMS/genoacms/commit/ef4754330d43c43c07eced483ff363b055da1306) Thanks [@Hejtmus](https://github.com/Hejtmus)! - Deleting a directory of more than 1000 objects on Cloud Storage now ends; it used to list the same page forever (GF38).

- Updated dependencies [[`813d2b5`](https://github.com/GenoaCMS/genoacms/commit/813d2b5ec6841e155cd697e45dccdb42e7f9c3d0)]:
  - @genoacms/contracts@0.0.3

## 0.9.0

### Minor Changes

- [`7a8ce2a`](https://github.com/GenoaCMS/genoacms/commit/7a8ce2a89b12bd7c99419456e27a670f555b79cb) Thanks [@Hejtmus](https://github.com/Hejtmus)! - Ported to the new config format (RFC-0006 to RFC-0010, RFC-0012, RFC-0014): each adapter exports a descriptor that `@genoacms/config` loads by package name from `genoa.config/`, and implements `@genoacms/contracts`. Configs written for `@genoacms/cloudabstraction` no longer load.

### Patch Changes

- [#13](https://github.com/GenoaCMS/genoacms/pull/13) [`63891bd`](https://github.com/GenoaCMS/genoacms/commit/63891bd51e5483c417ae8b6e0397a225d04a9cbc) Thanks [@Hejtmus](https://github.com/Hejtmus)! - Fix the open GCP findings (RFC-0027): directory deletes and moves are bounded and stop at the first failure, `startAfter` is exclusive, a directory move takes its new name literally, the deploy sets `IGNORED_ROUTES` so `/favicon.ico` and `/robots.txt` reach the app, and the dead `static/` middleware is gone.

- Updated dependencies [[`f85e6ae`](https://github.com/GenoaCMS/genoacms/commit/f85e6ae53a0f23e2cd77291b4527cd1b753138f8), [`63891bd`](https://github.com/GenoaCMS/genoacms/commit/63891bd51e5483c417ae8b6e0397a225d04a9cbc)]:
  - @genoacms/contracts@0.0.2
  - @genoacms/sveltekit-adapter-cloud-run-functions@1.0.1
