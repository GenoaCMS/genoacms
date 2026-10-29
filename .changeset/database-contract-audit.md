---
'@genoacms/contracts': minor
'@genoacms/conformance': minor
'@genoacms/adapter-gcp': minor
'@genoacms/adapter-aws': minor
'@genoacms/adapter-postgres': minor
---

The database contract's audit findings (RFC-0042). Documents hold only values every store can hold: well-formed strings without U+0000, numbers of 0 or magnitude 1e-130 to 1e126, no array directly inside an array, no sparse array and no circular reference. The key field is ignored before any check, also when `undefined`. An ID a store cannot hold reads as absent and deleting it sends no request. Query parameters are checked strictly (`limit` at most 1000, no unknown keys), and Firestore refuses a page token that does not fit the query, DynamoDB and Postgres one that is not their kind of ID. Postgres quotes field names literally and answers an empty page for a field with no column; DynamoDB no longer sends an empty `ExpressionAttributeValues`.
