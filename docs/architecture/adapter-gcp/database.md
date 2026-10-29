---
type: architecture
title: GCP database: Firestore
codes: [DB]
verified: 159aaffc
---

# GCP database: Firestore

Part of the [GCP adapter architecture](README.md). Markers, IDs and test references as defined there.

## Design

### Role

`@genoacms/adapter-gcp/database` serves GenoaCMS collections from Firestore in native mode. A
project may hold several Firestore databases, and each provider names one.

Collection definitions, static ones from the config and dynamic ones stored, signed, under
`.genoacms/databases/<database>/collections/` in the default bucket, are core's concern. The adapter receives only a
reference carrying a collection name.

### Decisions

**Names pass through unchanged (DB-3).** A GenoaCMS collection is the Firestore collection of the same
name. So any collection name reaches Firestore. The Firestore identity store
([`authentication-firestore.md`](authentication-firestore.md) GD10) therefore lives in a separate Firestore database that no
`databases` entry names, not in a reserved collection, because the operator, who defines every collection in the config
and in `.genoacms/collections`, could name one after it by mistake (GF28). CMS users define none.
*Cost:* Firestore reserves names matching `__.*__`. A collection the operator gives such a name fails at
its first write, with Firestore's error rather than a GenoaCMS one.

### Findings

| # | Finding | State |
| :-- | :-- | :-- |
| GF9 | **`getCollection` reads a whole collection** (DB-5): every document in one call, with no paging and no limit. Cost and latency grow with the collection, and a large one can exceed the function's memory. The contract offers no paging, so the fix belongs to the contract first. | fixed, RFC-0042 (`9b97ef12`) |
| GF13 | *History.* **The runtime's methods were untested by unit tests.** Only construction (DB-2) was. DB-3 to DB-7 relied on the opt-in conformance suite alone. | fixed, RFC-0024 |
| GF31 | **DB-5 and DB-7 are effectively unverified at `contract`.** Their only contract-level test is `packages/adapter-gcp/test/conformance.test.ts`, the database conformance suite, which passes a listing that misses the document and an update that changes nothing ([`contracts/conformance.md`](../contracts/conformance.md) CF7). The unit tests still check both against the mocked SDK. Found 2026-10-02. | fixed, RFC-0042 (`c648abcb`): the suite now checks both; its contract run is pending |
| GF28 | **The reason for DB-3's decision assumes that CMS users define collections.** They cannot: core only reads definitions from `.genoacms/collections`, which the operator writes (author, 2026-09-30). A reserved collection name is therefore at risk only from an operator's mistake. | fixed: the reason corrected |

### History

*History.* Firestore support predates the monorepo. RFC-0007 moved the bodies into the runtime
unchanged, with one client per provider, so two databases or two projects can be served at once.
RFC-0042 (`9b97ef12`) made it serve the database contract: paged and filtered queries, the key field in the data, typed errors; its amendment (`eeabe194`) added the IDs Firestore cannot hold, the strict tokens and the `undefined` key.

### Verification

The opt-in conformance suite (`test/conformance.test.ts`, `GENOACMS_TEST_GCP=1`) runs
`@genoacms/conformance`'s database cases against real Firestore with the operator's ADC.

## Specification

### Descriptor

#### DB-1 · Descriptor

Specifier `@genoacms/adapter-gcp/database`, kind `database`. Runtime specifier `@genoacms/adapter-gcp/database/runtime`. Options `projectId: string` (required), `databaseId?: string`, `credentials?: Secret<ServiceAccount>` decoded as JSON. Validation follows COM-2 and COM-3.

- Test: `packages/adapter-gcp/src/database/descriptor.test.ts`
- Level: unit

### Runtime

#### DB-2 · One client per provider

One `Firestore({ projectId, databaseId, credentials? })` client per provider (COM-4). `databaseId` defaults to `(default)`. Without `credentials`, none is passed.

- Test: `packages/adapter-gcp/src/database/runtime.test.ts`
- Level: unit

#### DB-3 · Collections by name

A collection reference `{ name }` addresses the Firestore collection `name` in that database. No prefix, no mapping.

- Test: `packages/adapter-gcp/src/database/runtime.test.ts`, `packages/adapter-gcp/test/conformance.test.ts`
- Level: unit, contract

#### DB-4 · Creating a document

`createDocument(ref, data)` takes a new reference from `collection.doc()` and writes `data` with the key field set to its ID, in one write, after the key field of `data` is ignored and the values are checked (DATA-2 to DATA-4). It returns `{ reference: { collection: ref, id }, data }`, where `data` is the input with the key field, not re-read.


- Test: `packages/adapter-gcp/src/database/runtime.test.ts`, `packages/adapter-gcp/test/conformance.test.ts` (unverified: the contract level, against the real store, has not run)
- Level: unit, contract

#### DB-5 · Reading a collection

`getCollection(ref, params)` is a Firestore query (DATA-8 to DATA-10): one `where` per condition, with the field as a `FieldPath` and the key field as `FieldPath.documentId()`; ordered by each field of an inequality condition, in name order, then by document ID; `limit` as given, and every fetched document filtered again with the contract's matching, so the adapter fetches on until it has `limit` matches or the query ends. A key condition on an ID Firestore cannot hold (empty, with `/`, `.`, `..`, matching `__.*__`, or over 1500 bytes) answers an empty page for `==`, ignores `!=`, and is applied in process for an order condition. The page token holds the last document's values of the inequality fields, in order, and its ID; one with another number of values is refused with `database/invalid-query:`. Every document read has the key field equal to its ID. A `FAILED_PRECONDITION` naming a missing index becomes `UnsupportedQueryError` (DATA-11).


- Test: `packages/adapter-gcp/src/database/runtime.test.ts`, `packages/adapter-gcp/test/conformance.test.ts` (unverified: the contract level, against the real store, has not run)
- Level: unit, contract

#### DB-6 · Reading a document

`getDocument({ collection, id })` returns `{ reference, data }` with the key field equal to the ID, or `undefined` when the document does not exist or the ID is one Firestore cannot hold (DATA-5).


- Test: `packages/adapter-gcp/src/database/runtime.test.ts`, `packages/adapter-gcp/test/conformance.test.ts` (unverified: the contract level, against the real store, has not run)
- Level: unit, contract

#### DB-7 · Updating and deleting

`updateDocument(ref, data)` is Firestore's `update` of each given field, passed as a `FieldPath` so a dotted name is one top-level field: a merge that fails with `DocumentNotFoundError` when the document does not exist, Firestore's `NOT_FOUND` included (DATA-6). The key field is ignored when `undefined` or equal to the ID, and otherwise throws `database/key-immutable: <key>` before any request (DATA-3); an update left with no field reads the document instead. It returns `{ reference: ref, data }` with the input `data`. `deleteDocument(ref)` deletes, deleting a missing document or an ID Firestore cannot hold is not an error. Other errors propagate.


- Test: `packages/adapter-gcp/src/database/runtime.test.ts`, `packages/adapter-gcp/test/conformance.test.ts` (unverified: the contract level, against the real store, has not run)
- Level: unit, contract
