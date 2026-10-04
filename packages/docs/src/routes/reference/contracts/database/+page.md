---
title: Database contract
---

What a database adapter implements, as `@genoacms/contracts/database` declares it. How an adapter is
shaped and registered is under [adapters](/guide/adapters); how a config declares collections is
under [services](/guide/config/services#Database).

A collection's `schema` and `primaryKey.schema` are `JsonSchema`: a JSON Schema object, typed
structurally. The contract carries schemas and never validates them; GenoaCMS validates documents
against them itself.

## Types

@include ../../../../../../contracts/src/database/types.d.ts

## Adapter

@include ../../../../../../contracts/src/database/adapter.d.ts

`create` receives the databases bound to the provider as `ctx.resources`.

## Custom schemas

`@genoacms/contracts/schemas` exports fields that point outside a document:

@include ../../../../../../contracts/src/schemas.d.ts
