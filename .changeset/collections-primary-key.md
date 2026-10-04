---
'@genoacms/cli': patch
---

`init`'s `collections.ts` example declares `primaryKey: { key: 'id', schema: { type: 'string' } }`, the shape the database contract declares and the AWS and Postgres adapters read, instead of a bare `'id'`.
