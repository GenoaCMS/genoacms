---
'@genoacms/contracts': patch
---

A collection's `schema` and `primaryKey.schema` are typed by the contract's own `JsonSchema`, a structural JSON Schema object, instead of ajv's `JSONSchemaType<any>`, which refused every ordinary schema. The contract no longer refers to ajv.
