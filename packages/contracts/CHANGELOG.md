# @genoacms/contracts

## 0.0.2

### Patch Changes

- [#18](https://github.com/GenoaCMS/genoacms/pull/18) [`f85e6ae`](https://github.com/GenoaCMS/genoacms/commit/f85e6ae53a0f23e2cd77291b4527cd1b753138f8) Thanks [@Hejtmus](https://github.com/Hejtmus)! - A collection's `schema` and `primaryKey.schema` are typed by the contract's own `JsonSchema`, a structural JSON Schema object, instead of ajv's `JSONSchemaType<any>`, which refused every ordinary schema. The contract no longer refers to ajv.
