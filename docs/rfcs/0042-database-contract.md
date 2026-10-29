---
type: rfc
number: 42
title: The database contract, with paged and filtered collection queries
status: draft
depends: [37]
architecture: [architecture/contracts/database.md, architecture/contracts/conformance.md, architecture/adapter-gcp/database.md, architecture/adapter-aws/database.md, architecture/collections.md]
changes: [DATA-1 added, DATA-2 added, DATA-3 added, DATA-4 added, DATA-5 added, DATA-6 added, DATA-7 added, DATA-8 added, DATA-9 added, DATA-10 added, DATA-11 added, DATA-12 added, DB-4 breaking, DB-5 breaking, DB-6 compatible, DB-7 compatible, DDB-4 compatible, DDB-5 breaking, DDB-6 breaking, DDB-7 compatible]
commit-subject: "feat: the database contract, with paged and filtered collection queries (RFC-0042)"
---

# RFC-0042: The database contract, with paged and filtered collection queries

## Summary

No database adapter honours `QueryParams`, and the three disagree on IDs, on the key field, on
updating a missing document and on values (`contracts/database.md` CF51 to CF57). The author decided
the contract (CU11 to CU16). This RFC:

1. Replaces `QueryParams` and makes `getCollection` return a page, `{ documents, next }` (DATA-1,
   DATA-8 to DATA-10).
2. Adds `DocumentNotFoundError`, `UnsupportedQueryError` and `isDocumentNotFound` to
   `@genoacms/contracts/database` (DATA-12).
3. Brings Firestore, DynamoDB and Postgres to DATA-1 to DATA-12.
4. Rewrites the database conformance suite to test every DATA statement, with a mutant per test
   (`contracts/conformance.md` CF7, CD5).
5. Moves core onto the page type; core's behavior does not change, apart from the key field now
   being in every document read (DATA-3).

**Amended after its falsification audit** (`contracts/database.md` CS8, CF59 to CF66; CU17): values
every store can hold; the key field ignored before any check, and an `undefined` key omitted; IDs a
store cannot hold read as absent; Postgres field names literal; parameters checked strictly,
`limit` at most 1000, and tokens refused when they do not fit the query; DynamoDB's empty value map;
and conformance cases for orderings and paging paths the suite missed.

## Files

**Modify or create only:**

| File | Change |
| :-- | :-- |
| `packages/contracts/src/database/types.d.ts` | `Comparable`, `Condition`, `QueryParams`, `CollectionPage`; `CollectionSnapshot` removed |
| `packages/contracts/src/database/adapter.d.ts` | `getCollection` returns `Promise<CollectionPage<C>>` |
| `packages/contracts/src/database/index.js`, `index.d.ts` | the errors and guard of DATA-12; the new types exported |
| `packages/contracts/src/database/errors.test.js` | new: DATA-12 |
| `packages/contracts/package.json` | the export `./database/query` |
| `packages/contracts/src/database/query.js`, `query.d.ts` | new, shared by adapters: `checkQuery`, `checkValues`, `matches`, `encodeToken`, `decodeToken` (§Shared) |
| `packages/contracts/src/database/query.test.js` | new: their unit tests |
| `packages/adapter-gcp/src/database/runtime.ts`, `runtime.test.ts` | DATA-1 to DATA-11 on Firestore (§Firestore) |
| `packages/adapter-aws/src/database/runtime.ts`, `runtime.test.ts`, `values.ts` | DATA-1 to DATA-11 on DynamoDB (§DynamoDB) |
| `packages/adapter-aws/test/contract/database.test.ts` | its assertions of the array and of `data` without the key follow DDB-5 and DDB-6 as §Changed gives them |
| `packages/adapter-postgres/src/runtime.js`, `runtime.test.js`, `test/fixture.js` | DATA-1 to DATA-11 on Postgres (§Postgres) |
| `packages/conformance/src/database.js`, `src/index.d.ts`, `README.md` | the suite of §Conformance and its fixture `{ collection, prefix }` |
| `packages/conformance/test/database.test.js`, `test/registration/suites.registration.js` | the suite against `memoryDatabase` and every mutant |
| `packages/docs/src/routes/guide/adapters/+page.md` | the database suite's fixture |
| `packages/conformance/test/memory.js` | `memoryDatabase` to the contract |
| `packages/conformance/test/mutants/database.js`, `database.mutant.js` | new: one mutant per suite test, as `storage.js` / `storage.mutant.js` |
| `packages/adapter-gcp/test/conformance.test.ts`, `packages/adapter-aws/test/conformance.test.ts`, `packages/adapter-postgres/test/conformance.test.js` | the new fixture; describe titles carry the DATA IDs |
| `packages/core/src/lib/script/database/database.server.ts`, `user.server.ts` | the page type; `getUserCollection` projects `page.documents` and returns the page |
| `packages/core/src/lib/script/database/user.server.test.ts`, `packages/core/evidence/permissionMatrix.test.ts` | their stubs of the database service return pages |
| `packages/core/src/routes/(admin)/collections/[collectionName]/+page.server.ts` and any other caller of `getUserCollection` | read `.documents`; no `limit`, so the listing still holds every document (LST-1) |
| `.changeset/database-contract.md` | new: `@genoacms/contracts` minor, `@genoacms/conformance` minor, `@genoacms/adapter-gcp` minor, `@genoacms/adapter-aws` minor, `@genoacms/adapter-postgres` minor, `@genoacms/core` minor |
| `docs/architecture/contracts/database.md`, `contracts/README.md`, `contracts/conformance.md`, `adapter-gcp/database.md`, `adapter-aws/database.md`, `docs/README.md` | after the code (§Steps) |

**Amended by the audit:** `packages/contracts/src/database/query.js`, `query.d.ts`, `query.test.js`; the three
adapters' runtimes and unit tests (the one existing test that changes is named under *Existing tests
that change*); `packages/conformance/src/database.js`, whose fixture `jsonDocument()` held an array
inside an array (`[1, [2]]`), which DATA-2 now refuses, and was given `{ two: 2 }` in its place at
`1ca2c2eb`, its assertion unchanged; `test/mutants/database.js`, `test/memory.js`; `.changeset/database-contract-audit.md` (the same packages, minor).

## Specification

### Added

DATA-1 to DATA-12, as `contracts/database.md` states them at the commit of this RFC.

### Changed

Each adapter statement becomes a reference to the contract plus what is particular to the store:

- **DB-4** (breaking): `createDocument(ref, data)` adds a document with a Firestore-generated ID, with
  the key field set to that ID (`contracts/database.md` DATA-3, DATA-4). Breaking: a key field given in
  `data` is no longer stored as given.
- **DB-5** (breaking): `getCollection(ref, params)` is a Firestore query: one `where` per condition
  with the field as a `FieldPath`, the key field as `FieldPath.documentId()`; ordered by each field
  of an inequality condition, in name order, then by document ID; `limit` as given. It returns a
  page (DATA-8 to DATA-10); a `FAILED_PRECONDITION` naming a missing index becomes
  `UnsupportedQueryError` (DATA-11).
- **DB-6** (compatible): as today, and the key field is in `data` (DATA-3).
- **DB-7** (compatible): updating a missing document throws `DocumentNotFoundError` (DATA-6), not
  Firestore's `NOT_FOUND`; the key field is ignored or refused as DATA-3 says. By the amendment, an
  `undefined` key field is ignored too, where the code threw `database/key-immutable`.
- **DDB-4** (compatible): unchanged, and the returned `data` has the key field (DATA-3).
- **DDB-5** (breaking): a `Scan` with a `FilterExpression` (§DynamoDB), continued until it has
  `limit` matches or reaches the end, returning a page; the key attribute stays in `data`.
- **DDB-6** (breaking): the key attribute stays in `data` (DATA-3). Breaking: a reader that took
  `data` as the fields without the key now sees the key.
- **DDB-7** (compatible): a `ConditionalCheckFailedException` on update becomes
  `DocumentNotFoundError`; a key field equal to the ID is ignored, and by the amendment so is an
  `undefined` one (DDB-7 stated that any key field in `data` throws).

The new texts are written into the adapter documents in step 5.

### Shared

`packages/contracts/src/database/query.js`, pure, JSDoc-typed, exported from
`@genoacms/contracts/database/query`:

```js
/** DATA-8: throws Error('database/invalid-query: <reason>') unless params match the types. */
function checkQuery (params) {}
/** DATA-2: throws Error('database/unsupported-value: <path>') for the first value that is not JSON. */
function checkValues (data) {}
/** DATA-9: whether data (with its key field) matches every condition. For adapters that filter in process. */
function matches (data, conditions) {}
/** An opaque page token of a JSON value, base64url of its JSON; and back, refusing what it did not issue. */
function encodeToken (value) {}
function decodeToken (token) {} // throws database/invalid-query: unknown page token
```

`matches` compares strings with `Buffer.compare(Buffer.from(a), Buffer.from(b))`, numbers by value,
`false < true`, `null` only by `==`; a missing field, another type, an array or an object match
nothing.

### Firestore

In `adapter-gcp/src/database/runtime.ts`:

- Every write runs `checkValues` first. `createDocument` takes a new reference with
  `collection.doc()` and writes `set({ ...data, [key]: id })`, one write, so the key field is the ID.
- `getDocument` and `getCollection` set `data[key] = id` on every snapshot.
- A condition on the key field whose value is not a string matches nothing (DATA-9): the query is
  not sent, and the page is empty. A string one is a `where` on `FieldPath.documentId()`.
- `updateDocument`: a key field different from `reference.id` throws `database/key-immutable: <key>`;
  an equal one is removed; an update left with no field reads the document and throws
  `DocumentNotFoundError` when it does not exist, since `update()` takes at least one field; each
  field is passed to `update` as a `FieldPath`, so a dotted name is one
  top-level field (DATA-6), not a path; Firestore's `NOT_FOUND` (code 5) becomes `DocumentNotFoundError`.
- `getCollection(ref, params = {})`: `checkQuery(params)`. Conditions with `!=` on Firestore also
  return documents whose field holds another type, so the adapter filters every fetched document
  with `matches` and keeps fetching, in batches of `limit` (or everything without `limit`), until it
  has `limit` matches or the query ends. The page token encodes `{ values, id }` of the last returned
  document: its values of the inequality fields, in order, and its ID, passed to `startAfter`.

### DynamoDB

In `adapter-aws/src/database/runtime.ts`:

- `FilterExpression` is the conditions joined by ` AND `, each `attribute_type(#fN, :tN) AND #fN <op>
  :vN` with `:tN` the DynamoDB type of the value (`S`, `N`, `BOOL`, `NULL`), `<>` for `!=`; for a
  `null` value, `attribute_type(#fN, :tN)` alone for `==`, and a condition that is never true for any
  other operator. The key field is the key attribute.
- `Scan` pages are read with `ExclusiveStartKey` until `limit` matches or `LastEvaluatedKey` is
  absent. When it stops inside a page, the page token encodes the key of the last returned item;
  otherwise `LastEvaluatedKey`. `next` is absent only when the scan ended.
- DynamoDB compares booleans with `=` and `<>` only, so an order condition on a boolean is written as
  the equalities it means under `false < true`: `< true` and `<= false` as `= false`, `> false` and
  `>= true` as `= true`, `<= true` and `>= false` as `attribute_type` `BOOL` alone, and `< false` or
  `> true` as never true.
- `withoutKey` is no longer applied to reads: `data` keeps the key attribute (DATA-3).
- `updateDocument`: a key field equal to `id` is removed before the request; the condition failure
  becomes `DocumentNotFoundError`.

### Postgres

In `adapter-postgres/src/runtime.js`:

- `createDocument`: `checkValues`; the key field is removed; a key whose `primaryKey.schema.type` is
  `string` gets `randomUUID()`; any other key is left to the column's default; the row is inserted
  `RETURNING *`, and `id` is `String(row[key])`. Arrays and plain objects are written as JSON text.
- Every document read has `data[key] = String(row[key])`, so the key field equals the ID (DATA-1,
  DATA-3) whatever the column's type.
- `getDocument`: `undefined` when no row. `id` compares through the column's type.
- `updateDocument`: as Firestore's key rule; `update ... returning key`; no row updated throws
  `DocumentNotFoundError`; an update left with no field checks that the row exists instead, and
  throws the same when it does not.
- `getCollection`: `checkQuery`; each condition is `CASE WHEN jsonb_typeof(to_jsonb(<col>)) =
  '<type>' THEN <expr> END <op> ?`, so the cast runs only on a value of that type (Postgres may
  evaluate the operands of an `AND` in any order, and `'abc'::numeric` fails), where `<expr>` reads the value as text with `to_jsonb(<col>) #>> '{}'`, so a `jsonb`
  column gives its unquoted value as a `text` column does: `(…) COLLATE "C"` for a string,
  `(…)::numeric` for a number, `(…)::boolean` for a boolean; `== null` is `<col> IS NULL`, and another operator
  with `null` is `false`. A condition on the key column compares the ID, a string:
  `<key>::text COLLATE "C" <op> ?` for a string value, `false` for any other. Ordered by the key column; `limit` as given; the page token encodes the
  last row's key, continued with `<key> > ?`. Columns are quoted identifiers.

### Conformance

`runDatabaseConformance(adapter, fixture)` with `fixture = { collection, prefix }`, `prefix` a run
name every document created carries in the field `run`, and every test deleting what it created.
Tests, each titled with the statement it checks:

| Title | Asserts |
| :-- | :-- |
| `DATA-2: JSON values read back as written` | a document of nested objects, arrays, numbers, `null`, booleans and a non-ASCII string reads back equal (fields a fixed-column store does not have are left out of the fixture's schema) |
| `DATA-2: a value that is not JSON is refused before any request` | `NaN`, a `Date` and `undefined` in an array each throw `database/unsupported-value: <path>`, and no document is created |
| `DATA-3, DATA-4: a created document has a store-assigned ID and its key field` | the given key field is ignored; the returned and read `data[key]` equal `id`; two creates get different IDs |
| `DATA-3: updating the key to another value is refused` | `database/key-immutable: <key>` and the document is unchanged |
| `DATA-5: a missing document reads as undefined` | |
| `DATA-6: an update sets the given fields and keeps the others` | |
| `DATA-6, DATA-12: updating a missing document throws DocumentNotFoundError` | `isDocumentNotFound` is true, message `database/not-found: <collection>/<id>`, nothing is created |
| `DATA-7: a document is deleted, and deleting it again is not an error` | |
| `DATA-8: malformed parameters are refused` | an unknown operator, `limit: 0`, `limit: 1.5`, an array as a value, and a forged `pageToken` each throw `database/invalid-query:` |
| `DATA-9: each operator matches by type and value` | over fixture documents with a number, a string, a boolean, `null` and a missing field: each operator against each type returns exactly the documents DATA-9 says, `'10' < '9'` and `'Z' < 'a'` included |
| `DATA-9: conditions combine with AND, and a condition on the key compares the ID` | |
| `DATA-10: without a limit one page holds every match and has no next` | |
| `DATA-10: pages of a limit hold every match exactly once` | with 7 matching documents and `limit: 3`: pages of 3, 3 and 1 (or 3, 3, 1 and an empty one), no document twice, every one once, `next` absent on the last |

The in-memory `memoryDatabase` of `conformance/test/memory.js` implements the contract with
`checkQuery`, `checkValues` and `matches`, ordering by ID. `test/mutants/database.js` defines one
mutant per test that breaks exactly what it checks; each must fail its test (CD5).

### Core

`database.server.ts`'s `getCollection` returns the adapter's page. `getUserCollection(ctx, reference,
params)` returns `{ documents: projected, next }`. Every caller that listed snapshots reads
`.documents` and passes no `limit`.

### Amended by the audit

DATA-2, DATA-3, DATA-5, DATA-7, DATA-8 and DATA-9 hold the text of `contracts/database.md` at the
commit of this amendment (CU17; CF59 to CF65). The code:

- **Shared (`query.js`).** `checkValues(data)` follows DATA-2: strings checked with
  `String.prototype.isWellFormed()` and for `\u0000`; numbers by `Number.isFinite`, then `0` or
  `Math.abs(n)` from `1e-130` to `1e126`; arrays
  dense (`Object.keys(a).length === a.length`, a sparse one throwing at the array's own path, such as
  `tags`) and of non-arrays; the objects on the path kept in a set, a repeat throwing at the path of
  the reference that repeats, such as `meta.self`. `checkQuery(params)` refuses `null`, a non-object, an array,
  any key outside `where`, `limit`, `pageToken`, a sparse `where` and `limit` above 1000.
- **Key handling, every adapter.** Before `checkValues`, a create removes the key field, and an update
  removes it when it is `undefined` or equals the ID.
- **Firestore.** `isStorableId(id)`: a non-empty string without `/`, not `.` or `..`, not matching
  `__.*__`, at most 1500 bytes. `getDocument` and `deleteDocument` of an ID that is not storable
  return `undefined` and do nothing. A key condition whose value is a string that is not storable:
  `==` matches nothing; `!=` is dropped; an order condition is applied in process with `matches`, the
  query fetched without it. A page token is refused unless its `values` hold one value per inequality
  field of the query; this check is Firestore's alone (DB-5), since the other stores' tokens are an ID
  and hold nothing of the query.
- **DynamoDB.** `ExpressionAttributeValues` is omitted when it has no entry. A page token is refused
  unless it decodes to an object holding the key attribute alone, of type `S`; of the query it can
  check nothing.
- **Postgres.** Identifiers are quoted literally by a function `identifier(name)`: `"` doubled, the
  whole wrapped in `"`, passed with `knex.raw`. The columns of a table are read once per adapter and
  table from `information_schema.columns`; a condition on a field with no column matches nothing,
  and a query with such a condition answers an empty page without being sent. `getDocument` and
  `deleteDocument` of `''` return `undefined` and do nothing. A page token is refused unless it
  decodes to a string or a number; of the query it can check nothing.

## Non-goals

- Caller-chosen order, `in`, `array-contains`, nested fields, case-insensitive matching.
- Composite keys; transactions; conditional document writes.
- A Postgres adapter Specification document beyond the contract (CF58 stays open for it).
- Paging in core's listing screen (`collections.md` OF8); RFC-0041 pages for agents.

## Tests

Unit tests per adapter, each title carrying the statement and the adapter statement it checks, with
the store's client mocked:

| File | Title | Given / when / then |
| :-- | :-- | :-- |
| `adapter-gcp/src/database/runtime.test.ts` | `DATA-9, DB-5: conditions become where clauses ordered by their inequality fields then the ID` | given `[{ field: 'b', operator: '<', value: 2 }, { field: 'a', operator: '==', value: 'x' }]` and `limit: 3`; then the query has both `where`s, `orderBy('b')` then `orderBy(documentId)`, `limit(3)` |
| same | `DATA-11, DB-5: a missing index becomes UnsupportedQueryError` | given the client rejects with code 9 and a message with a URL; then `UnsupportedQueryError` whose message ends with that message |
| same | `DATA-6, DB-7: a missing document becomes DocumentNotFoundError` | given `update` rejects with code 5; then `DocumentNotFoundError` |
| `adapter-aws/src/database/runtime.test.ts` | `DATA-9, DDB-5: conditions become a typed FilterExpression` | given `a == 'x'` and `b < 2`; then `attribute_type(#f0, :t0) AND #f0 = :v0 AND attribute_type(#f1, :t1) AND #f1 < :v1` with `:t0 = S`, `:t1 = N` |
| same | `DATA-10, DDB-5: scanning continues until the limit and resumes after the last returned item` | given two scan pages of 2 matching items each and `limit: 3`; then 3 documents, and `next` resumes with `ExclusiveStartKey` of the third |
| same | `DATA-3, DDB-6: the key attribute stays in data` | |
| `adapter-postgres/src/runtime.test.js` | `DATA-9: conditions are typed and strings compare in byte order` | the generated SQL holds `jsonb_typeof` and `COLLATE "C"` for a string condition |
| same | `DATA-5, DATA-6: a missing row reads as undefined and updates as not found` | |
| `contracts/src/database/errors.test.js` | `DATA-12: the errors carry their names and messages, and the guard recognizes by name` | |
| `contracts/src/database/query.test.js` | `DATA-8: checkQuery refuses what the types do not allow`; `DATA-9: matches follows the type and order rules`; `DATA-10: a token round-trips and a forged one is refused` | |

The conformance suite runs at level `conformance` against `memoryDatabase` and its mutants, and at
level `contract` against Firestore (`genoacms-tests`), DynamoDB and Postgres 16 in CI.

### Existing tests that change

Named for the implementation step (§Steps 3), which changes them and no other:

| File | Title | New assertion |
| :-- | :-- | :-- |
| `adapter-aws/src/database/runtime.test.ts` | `DDB-7: refuses a key field present with the value undefined` | renamed `DATA-3, DDB-7: an undefined key field is ignored`; `updateDocument(document, { id: undefined, a: 1 })` succeeds, and the `UpdateItem` sets `a` alone |

The same contradiction is in the code of `adapter-gcp/src/database/runtime.ts` (`Object.hasOwn(data,
key) && data[key] !== reference.id`) and `adapter-postgres/src/runtime.js`, which throw on an
`undefined` key as well; their unit tests have no assertion of it, so no other test changes. The
statements that contradict DATA-3 are DDB-7 of `adapter-aws/database.md` (*a key field in `data`
throws*), which §Changed above rewrites, and the DB-7 text, which does not mention an `undefined` key.
`contracts/database.md` CF63 is the finding. The in-memory adapter and its mutant
(`conformance/test/mutants/database.js`) follow DATA-3 as amended.

### Amendment tests

Written first, marked `it.fails` where they fail, each title carrying the statement and the finding.
The conformance cases each get a mutant.

| File | Title | Asserts |
| :-- | :-- | :-- |
| `conformance/src/database.js` | `DATA-2, CF65: values no store can hold are refused before any request` | `[[1]]`, `1e127`, `1e-131`, `5e-324`, `'a\u0000'`, `'\uD800'`, a sparse array (path `tags`, the array's own) and a circular object (path `meta.self`, the repeating reference) each throw `database/unsupported-value: <path>`, and nothing is created; `1e126` and `1e-130` are accepted. |
| same | `DATA-3, CF62, CF63: the key field is ignored before any check` | a create with `id: NaN` succeeds under a store-assigned ID; an update with `id: undefined` sets the other fields |
| same | `DATA-5, DATA-7, CF60: an ID the store cannot hold reads as absent` | `getDocument` of `''` and of `'a/b'` is `undefined`; deleting them is not an error |
| same | `DATA-8, CF64: parameters are checked strictly` | `null`, `'x'`, `{ conditions: [] }`, a sparse `where`, `limit: 1001`, and well-formed tokens whose payload fits no query (`true`, `null`, `[]`, an unrelated object), given with a query holding an inequality, each throw `database/invalid-query:` (the conformance case builds each token as base64url of that JSON, so it is well-formed; a payload that is not of the store's token shape is what every store refuses) |
| `adapter-gcp/src/database/runtime.test.ts` | `DATA-8, DB-5: a page token whose values do not match the inequality fields is refused` | a token whose `values` hold none, or two, for a query with one inequality field, throws `database/invalid-query:` before the query |
| same | `DATA-9, CF66: strings order by UTF-8 bytes and numbers by value, signs included` | over `'a'`, `'é'`, `'z'`, `'Ω'`, `'～'` (U+FF5E, which UTF-16 code units order after `'😀'`), `'😀'` and `-2`, `-0`, `0`, `1.5`: `<` and `>=` give the byte and numeric orders |
| same | `DATA-10, CF66: paging holds with an inequality, a limit of 1 and a limit above the matches` | 7 documents with `count` from 0 to 6, `where count >= 2`: with `limit: 1`, five pages and perhaps an empty sixth, each match once; with `limit: 50`, one page of 5 and no `next` |
| `adapter-aws/src/database/runtime.test.ts` | `DATA-9, CF59: a query that cannot match sends no empty ExpressionAttributeValues` | for `< null`, `!= null` and `< false`, the `Scan` input has no `ExpressionAttributeValues` key |
| `adapter-gcp/src/database/runtime.test.ts` | `DATA-9, CF60: a key condition on an ID Firestore cannot hold compares as a string` | `id == 'a/b'` answers an empty page without a query; `id < 'b/c'` filters in process |
| `adapter-postgres/src/runtime.test.js` | `DATA-8, DATA-9, CF61: field names are literal and a field without a column matches nothing` | a condition on `a.b` quotes `"a.b"`; one on a field outside the columns answers an empty page without the query |
| `contracts/src/database/query.test.js` | `DATA-2, DATA-8, CF64, CF65: checkValues and checkQuery follow the subset and the strict parameters` | the conformance inputs above, without a store |

## Steps

1. Commit `contracts/database.md` and the index changes, then this RFC, separately.
2. A session that has not seen the implementation writes the conformance suite, the mutants, the
   in-memory adapter and the unit tests of §Tests, those failing today marked `it.fails`. Commit:
   `test: the database contract's conformance suite and tests (RFC-0042)`.
3. Another session implements §Shared, §Firestore, §DynamoDB, §Postgres and §Core, removes the
   markers without changing an assertion (the adapters' conformance blocks are `describe.skip` until
   then, and become `describe`), updates the unit tests of DB-3 to DB-5 and DDB-4 to DDB-7 to
   §Changed, and adds the changeset. Commit with the `commit-subject`.
4. Run the contract tests: Firestore and DynamoDB need the credentials CI has on `main`; Postgres
   runs in CI and locally with `GENOACMS_TEST_POSTGRES=1`.
5. A falsification audit of DATA-1 to DATA-12 by an agent that wrote none of it (done: CS8, CF59 to
   CF66).
6. The amendment: its tests written first by a session that has not seen the code (`test: the
   database contract's audit findings (RFC-0042)`), then its code (`fix: the database contract's
   audit findings (RFC-0042)`), as steps 2 and 3.
7. Update the documents: DATA-1 to DATA-12 current with their tests; the adapter statements to
   §Changed; CF7, CF51 to CF57, CF59 to CF66 and GF9 fixed; CU17 current; History; this RFC
   `implemented` with the commits of steps 3 and 6. Commit: `docs: the database contract current
   (RFC-0042)`.

## Verification

```bash
pnpm -r --filter '@genoacms/contracts' --filter '@genoacms/conformance' --filter '@genoacms/adapter-*' run build
pnpm --filter @genoacms/contracts run test
pnpm --filter @genoacms/conformance run test
pnpm --filter @genoacms/adapter-gcp --filter @genoacms/adapter-aws --filter @genoacms/adapter-postgres run test
# all pass; the contract tests skip without credentials or GENOACMS_TEST_POSTGRES=1
GENOACMS_TEST_POSTGRES=1 pnpm --filter @genoacms/adapter-postgres run test
# against a local Postgres 16: all pass
pnpm --filter @genoacms/core run adapters && pnpm --filter @genoacms/core exec vitest run --project node
# all pass
node docs/tools/check-docs.mjs docs
# 0 error(s)
```

## Critique

**Pros**
- One contract for the three stores: IDs, the key field, missing documents and values agree, and a
  suite checks each statement against each store.
- Queries run in the store: a page of a large Firestore or Postgres collection no longer reads the
  whole collection.
- Callers can tell a missing document, a query the store needs configured for, and an outage apart.

**Cons & trade-offs**
- Breaking for every adapter and for `@genoacms/contracts`: `getCollection` returns a page, and the
  key field is now in `data` on DynamoDB and Firestore.
- DynamoDB still scans: a selective query on a large table reads the whole table across its pages.
- Firestore filters `!=` again in process, so a page can take several reads.
- Firestore queries combining inequalities need indexes the operator creates; they fail until then.
- Comparisons are by type and bytes only: `'10' < '9'`, no case folding, and `!= null` matches
  nothing.
- Postgres compares through `to_jsonb` and casts, which no index serves.

- The amendment makes the contract stricter than JSON: arrays of arrays, very large or small
  numbers and strings with U+0000 are refused everywhere, though some stores could hold them.
- Postgres reads a table's columns once per adapter; a column added later is unseen until restart.

**Blindspots & missed edge cases**
- A Firestore document written before this change, with a key field that differs from its ID, now
  reads with the key field overwritten by the ID; the stored field is not rewritten.
- A Postgres key with a default that is not unique, or no default for a non-string key, makes
  `createDocument` fail with the store's error.
- Numbers beyond 2^53 or with many digits compare differently in DynamoDB (decimal) and in
  JavaScript; JSON values do not include them, but nothing checks that a read value is exact.
- Firestore orders integers and doubles together but may differ from JavaScript for `-0` and very
  large values.
- The page token is opaque but not signed: a caller can craft one; it can only move the start of a
  query the caller may run anyway.
- Core's listing still reads every document (no `limit`); only RFC-0041's agents page.
- Documents stored before the amendment with values DATA-2 now refuses still read, but an update
  that keeps such a field fails on a field it did not touch.
- A well-formed token of another query with the same shape is accepted and moves only the start.
- Only Firestore can refuse a page token that does not fit the query; DynamoDB and Postgres tokens are an ID.
