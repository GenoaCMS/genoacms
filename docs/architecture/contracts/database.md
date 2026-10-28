---
type: architecture
title: Database contract
codes: [DATA]
verified: 6b81d4b
---

# Database contract

Part of the [service contracts](README.md). Markers, IDs and test references as defined there.

## Design

### Role

The database contract is what every database adapter implements and core consumes: five methods
over the documents of a collection, `createDocument`, `getDocument`, `getCollection`,
`updateDocument` and `deleteDocument`. A collection is a Firestore collection, a DynamoDB table or a
Postgres table; core routes each collection to its adapter ([`host.md`](../host.md)) and adds
permissions, field restrictions and validation on top ([`collections.md`](../collections.md) DOC).

```
core document service ──▶ Adapter ──▶ Firestore (adapter-gcp)
  getCollection(ref, { where, limit, pageToken }) ─▶ { documents, next }   DynamoDB (adapter-aws)
  createDocument · getDocument · updateDocument · deleteDocument            Postgres (adapter-postgres)
```

Out of scope: defining or creating collections, which the operator does in each store; transactions
and conditional writes on documents (`agent-access.md` TU13); ordering chosen by the caller; queries
on nested fields; composite keys.

### Decisions

| # | Decision | Where |
| :-- | :-- | :-- |
| CU11 | 2026-10-28: a collection is listed in pages continued with an opaque cursor: `getCollection(ref, { where, limit, pageToken })` returns `{ documents, next }`. | CD12; DATA-8, DATA-10 |
| CU12 | 2026-10-28: a query filters with comparisons, `==`, `!=`, `<`, `<=`, `>`, `>=`, on top-level fields, combined with AND. A query the store cannot serve without configuration, such as a Firestore index, is refused with a typed error. | CD13; DATA-9, DATA-11 |
| CU13 | 2026-10-28: a document's ID always comes from the adapter or its store; a caller cannot choose it. | CD15; DATA-4 |
| CU14 | 2026-10-28: the primary key is a read-only part of a document's data: reads include it, equal to the ID, and writes never set it. | CD14; DATA-3 |
| CU15 | 2026-10-28: updating a document that does not exist fails with a typed error, `DocumentNotFoundError`, and writes nothing. | DATA-6, DATA-12 |
| CU16 | 2026-10-28: a document holds JSON values only; any other value is refused before any request. | DATA-2 |

**CD12. Pages in the store's own order, continued with an opaque cursor (DATA-8, DATA-10).** The
caller chooses neither the order nor an offset; `next` encodes where the store stopped.
*Why:* DynamoDB can only resume a scan from the last key it returned, in an order it chooses;
Firestore orders a query with an inequality by that field first; Postgres can order by anything. An
order every store can keep is the store's own, and a cursor of the last document returned is the
only way to continue it that each can implement without reading the skipped documents again.
*Cost:* no caller-chosen order, so a screen sorting by a field sorts one page. DynamoDB reads every
item it skips, so a query matching few items of a large table costs a full scan, and a page after a
full one may be empty. A document whose sort field changes between pages may appear twice or not at
all.

**CD13. A condition compares values of one JSON type, and strings by their UTF-8 bytes (DATA-9).** A
document whose field is missing, or holds another type, matches no condition on that field.
*Why:* it is the one semantics all three stores share: Firestore filters within a type, DynamoDB
compares a value of another type as false, and Postgres compares typed columns, with the `C`
collation giving byte order. Anything richer, such as case folding or locale order, would differ
between them.
*Cost:* `'10' < '9'`, and a number stored as a string is not found by a numeric condition. There is
no case-insensitive search.

**CD14. The key is in the data, and only the store writes it (DATA-3).** A read returns the key field
equal to `reference.id`; a create ignores it, an update refuses a different value.
*Why:* in SQL and DynamoDB the key is a column or an attribute of the row, and a later composite key
is several of them, so leaving it out of the data would hide part of every row. Letting callers write
it would let a Firestore document carry a key field that disagrees with its ID, as it can today.
*Cost:* Firestore stores the key field as a copy of the document's ID. A schema that lists the key as
required cannot validate a submission to create, which does not have it yet.

**CD15. The store assigns IDs (DATA-4).**
*Why:* Firestore generates an ID when none is given, DynamoDB has none to generate and the adapter
draws a UUID, and a Postgres table may have a default; in each the store or its adapter knows how
to make a unique one, and a caller-chosen ID would need a conditional create in each.
*Cost:* no natural keys: a slug is a field, not the ID.

### Findings

| # | Finding | State |
| :-- | :-- | :-- |
| CF51 | **No adapter honours `QueryParams` (DATA-8).** Firestore reads every document (`adapter-gcp/database.md` GF9), DynamoDB scans every item, Postgres selects every row; `limit`, `startAfter` and `conditions` are ignored. Found 2026-10-28 by reading the three adapters at `6b81d4b`. | open; RFC-0042 |
| CF52 | **`QueryParams` cannot be implemented as typed (DATA-8).** Every value is a string, `conditions` is a tuple of one, and `startAfter: { field, value }` resumes from a field value, which a DynamoDB scan cannot. Found 2026-10-28 by reading `packages/contracts/src/database/types.d.ts`. | open; RFC-0042 |
| CF53 | **Who chooses an ID differs (DATA-4).** Firestore and DynamoDB generate one; Postgres takes the key field of `data`, and returns an `undefined` ID when it is absent. Found 2026-10-28 by reading. | open; RFC-0042 |
| CF54 | **The key field in data differs (DATA-3).** DynamoDB strips it from what it reads and overrides it on create; Firestore stores a key field as an ordinary field, which may disagree with the ID; Postgres reads and writes it as a column. Found 2026-10-28 by reading. | open; RFC-0042 |
| CF55 | **Updating a missing document differs (DATA-6).** Firestore throws its `NOT_FOUND`, DynamoDB its `ConditionalCheckFailedException`, and Postgres updates no row and succeeds. Found 2026-10-28 by reading. | open; RFC-0042 |
| CF56 | **Postgres reads a missing document as `{ reference, data: undefined }` (DATA-5),** not `undefined`. Found 2026-10-28 by reading. | open; RFC-0042 |
| CF57 | **Firestore accepts values that are not JSON (DATA-2),** such as a `Date`, which reads back as a Firestore `Timestamp`. Found 2026-10-28 by reading. | open; RFC-0042 |
| CF58 | **The Postgres adapter has no Specification of its own.** Its conformance test runs in CI against Postgres 16, but checks only what the database suite checks (`conformance.md` CF7), so nothing states or tests what it does beyond that. Found 2026-10-28 by reading. | open; RFC-0042 tests it against this contract |

### History

None. The contract was written on 2026-10-28 from the types of `packages/contracts/src/database/`,
the Specifications of the GCP and AWS adapters, and a reading of the three adapters at `6b81d4b`.

### Verification

Every statement is **New** (RFC-0042). It plans to check them from three sides:

- **`unit`:** each adapter's runtime against its mocked client, and `@genoacms/contracts`' errors.
- **`conformance`:** the suite of `contracts/conformance.md` CONF-2 for databases, rewritten to test
  every statement here, against an in-memory adapter and one mutant of it per test (CD5).
- **`contract`:** the same suite against Firestore, DynamoDB and Postgres.

## Specification

### Types

#### DATA-1 · Collections, references and snapshots

```ts
interface CollectionReference {
  name: string
  primaryKey: { key: string, schema: JsonSchema }
  schema: JsonSchema
}
interface DocumentReference<C extends CollectionReference> { collection: C, id: string }
interface DocumentSnapshot<C> { reference: DocumentReference<C>, data: Document<C> }
interface CollectionPage<C> { documents: Array<DocumentSnapshot<C>>, next?: string }
```

`primaryKey.key` names the one field holding a document's ID, and `id` is a string.

- Test: none yet
- Level: unit
- State: new (RFC-0042)

#### DATA-2 · Values

A document is a plain object whose values are JSON values: strings, finite numbers, booleans,
`null`, arrays and plain objects, recursively. A field whose value is `undefined` is omitted. Any
other value, `NaN`, `Infinity`, `undefined` in an array, a `bigint`, a `Date` or another class
instance among them, makes a write throw `database/unsupported-value: <path>` before any request,
where `<path>` is the field's dotted path, array indexes as numbers. A value reads back equal to the
value written. A store with a fixed set of fields, such as a table, MAY read a field the document was
never given as `null`.

- Test: none yet
- Level: unit, conformance, contract
- State: new (RFC-0042)

#### DATA-3 · The key

Every document read, by `getDocument`, `getCollection` or as returned by `createDocument`, has the
field `primaryKey.key` in its `data`, equal to `reference.id`. `createDocument` ignores that field in
the data it is given. `updateDocument` ignores it when it equals `reference.id`, and otherwise throws
`database/key-immutable: <key>` before any request.

- Test: none yet
- Level: unit, conformance, contract
- State: new (RFC-0042)

### Documents

#### DATA-4 · Creating a document

`createDocument(ref, data)` stores a new document under an ID the adapter or its store assigns,
unique in the collection, and returns `{ reference: { collection: ref, id }, data }`, `data` being
the input with the key field set to `id` (DATA-3).

- Test: none yet
- Level: unit, conformance, contract
- State: new (RFC-0042)

#### DATA-5 · Reading a document

`getDocument({ collection, id })` returns `{ reference, data }`, or `undefined` when no document has
that ID.

- Test: none yet
- Level: unit, conformance, contract
- State: new (RFC-0042)

#### DATA-6 · Updating a document

`updateDocument(ref, data)` sets each top-level field of `data` on the stored document, replacing its
value whole, and keeps every other field. It returns `{ reference: ref, data }` with the input
`data`. When no document has that ID it throws `DocumentNotFoundError` (DATA-12) and writes nothing.

- Test: none yet
- Level: unit, conformance, contract
- State: new (RFC-0042)

#### DATA-7 · Deleting a document

`deleteDocument(ref)` deletes the document. Deleting a document that does not exist is not an error.

- Test: none yet
- Level: unit, conformance, contract
- State: new (RFC-0042)

### Queries

#### DATA-8 · Query parameters

```ts
type Comparable = string | number | boolean | null
interface Condition { field: string, operator: '==' | '!=' | '<' | '<=' | '>' | '>=', value: Comparable }
interface QueryParams {
  where?: Condition[]                 // all must hold
  limit?: number                      // an integer, at least 1
  pageToken?: string                  // the `next` of the page before, with the same where and limit
}
type getCollection = <C>(reference: C, params?: QueryParams) => Promise<CollectionPage<C>>
```

`field` is a top-level field's name, taken literally, the key field included. A parameter outside
these types, a `limit` that is not an integer of at least 1, or a `pageToken` this adapter did not
issue, throws `database/invalid-query: <reason>` before any request.

- Test: none yet
- Level: unit, conformance
- State: new (RFC-0042)

#### DATA-9 · Which documents match

A document matches when it matches every condition. It matches a condition when its field holds a
value of the condition value's JSON type, and the comparison holds: numbers by value, strings by
their UTF-8 bytes, `false` before `true`; `null` is only equal to `null`, so `<`, `<=`, `>` and `>=`
with `null` match nothing. A document whose field is missing, or holds another type, an array or an
object, matches no condition on that field, `!=` included; a field that a store with a fixed set of
fields reads as `null` (DATA-2) holds `null`, and so matches `== null`. A condition on the key field
compares the ID.

- Test: none yet
- Level: unit, conformance, contract
- State: new (RFC-0042)

#### DATA-10 · Pages

Without `limit`, the page holds every matching document and has no `next`. With it, a page holds at
most `limit` documents, exactly `limit` unless it is the last, and has `next` unless it is the last.
The page after a full one may be empty. The order of documents is the adapter's, the same for every
page of one query. Across the pages of one query, a document that matches and is not changed while
they are read appears exactly once; a document created, deleted or changed meanwhile may appear or
not.

- Test: none yet
- Level: unit, conformance, contract
- State: new (RFC-0042)

#### DATA-11 · A query the store cannot serve

When the store refuses a query until it is configured for it, such as a Firestore query that needs a
composite index, `getCollection` throws `UnsupportedQueryError` (DATA-12), whose message is
`database/unsupported-query: <the store's reason>`, the reason carrying what to configure when the
store says.

- Test: none yet
- Level: unit
- State: new (RFC-0042)

### Failures

#### DATA-12 · Errors

`@genoacms/contracts/database` exports two error classes, recognized by their `name` (as
`contracts/storage.md` CD11 recognizes storage errors), and a guard for the first:

| Class | `name` | Message |
| :-- | :-- | :-- |
| `DocumentNotFoundError(reference)` | `DocumentNotFoundError` | `database/not-found: <collection>/<id>` |
| `UnsupportedQueryError(reason)` | `UnsupportedQueryError` | `database/unsupported-query: <reason>` |

`isDocumentNotFound(error)` is `true` for an error named `DocumentNotFoundError`. The other errors of
this contract are `Error`s with the coded messages of DATA-2, DATA-3 and DATA-8; a store's failure
otherwise propagates unchanged.

- Test: none yet
- Level: unit
- State: new (RFC-0042)
