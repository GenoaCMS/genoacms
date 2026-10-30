# @genoacms/adapter-postgres

## 0.10.1

### Patch Changes

- Updated dependencies [[`71a947c`](https://github.com/GenoaCMS/genoacms/commit/71a947c32e019353da45514c80a1ecae813fe50a)]:
  - @genoacms/contracts@0.2.0

## 0.10.0

### Minor Changes

- [#25](https://github.com/GenoaCMS/genoacms/pull/25) [`eeabe19`](https://github.com/GenoaCMS/genoacms/commit/eeabe19499974018fc510f84da7e18a7b6b79cf1) Thanks [@Hejtmus](https://github.com/Hejtmus)! - The database contract's audit findings (RFC-0042). Documents hold only values every store can hold: well-formed strings without U+0000, numbers of 0 or magnitude 1e-130 to 1e126, no array directly inside an array, no sparse array and no circular reference. The key field is ignored before any check, also when `undefined`. An ID a store cannot hold reads as absent and deleting it sends no request. Query parameters are checked strictly (`limit` at most 1000, no unknown keys), and Firestore refuses a page token that does not fit the query, DynamoDB and Postgres one that is not their kind of ID. Postgres quotes field names literally and answers an empty page for a field with no column; DynamoDB no longer sends an empty `ExpressionAttributeValues`.

- [#25](https://github.com/GenoaCMS/genoacms/pull/25) [`9b97ef1`](https://github.com/GenoaCMS/genoacms/commit/9b97ef12e59d47c8a043996a4966d91e3f271b3e) Thanks [@Hejtmus](https://github.com/Hejtmus)! - The database contract (RFC-0042). `getCollection` returns a page, `{ documents, next }`, and filters with typed comparison conditions (`==`, `!=`, `<`, `<=`, `>`, `>=`) compared by JSON type, strings by their UTF-8 bytes. The store assigns every ID, the key is a read-only field of `data` equal to the ID, updating a missing document throws `DocumentNotFoundError`, and a value that is not JSON is refused before any request. `@genoacms/contracts/database` exports the errors and `isDocumentNotFound`, and `@genoacms/contracts/database/query` the helpers adapters share. Breaking for database adapters: `QueryParams` and `getCollection`'s result change, and Firestore and DynamoDB documents now carry the key field in `data`. `runDatabaseConformance` takes `{ collection, prefix }`.

### Patch Changes

- Updated dependencies [[`eeabe19`](https://github.com/GenoaCMS/genoacms/commit/eeabe19499974018fc510f84da7e18a7b6b79cf1), [`9b97ef1`](https://github.com/GenoaCMS/genoacms/commit/9b97ef12e59d47c8a043996a4966d91e3f271b3e)]:
  - @genoacms/contracts@0.1.0

## 0.9.1

### Patch Changes

- Updated dependencies [[`813d2b5`](https://github.com/GenoaCMS/genoacms/commit/813d2b5ec6841e155cd697e45dccdb42e7f9c3d0)]:
  - @genoacms/contracts@0.0.3

## 0.9.0

### Minor Changes

- [`7a8ce2a`](https://github.com/GenoaCMS/genoacms/commit/7a8ce2a89b12bd7c99419456e27a670f555b79cb) Thanks [@Hejtmus](https://github.com/Hejtmus)! - Ported to the new config format (RFC-0006 to RFC-0010, RFC-0012, RFC-0014): each adapter exports a descriptor that `@genoacms/config` loads by package name from `genoa.config/`, and implements `@genoacms/contracts`. Configs written for `@genoacms/cloudabstraction` no longer load.

### Patch Changes

- Updated dependencies [[`f85e6ae`](https://github.com/GenoaCMS/genoacms/commit/f85e6ae53a0f23e2cd77291b4527cd1b753138f8)]:
  - @genoacms/contracts@0.0.2
