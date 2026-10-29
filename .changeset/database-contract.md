---
'@genoacms/contracts': minor
'@genoacms/conformance': minor
'@genoacms/adapter-gcp': minor
'@genoacms/adapter-aws': minor
'@genoacms/adapter-postgres': minor
'@genoacms/core': minor
---

The database contract (RFC-0042). `getCollection` returns a page, `{ documents, next }`, and filters with typed comparison conditions (`==`, `!=`, `<`, `<=`, `>`, `>=`) compared by JSON type, strings by their UTF-8 bytes. The store assigns every ID, the key is a read-only field of `data` equal to the ID, updating a missing document throws `DocumentNotFoundError`, and a value that is not JSON is refused before any request. `@genoacms/contracts/database` exports the errors and `isDocumentNotFound`, and `@genoacms/contracts/database/query` the helpers adapters share. Breaking for database adapters: `QueryParams` and `getCollection`'s result change, and Firestore and DynamoDB documents now carry the key field in `data`. `runDatabaseConformance` takes `{ collection, prefix }`.
