---
type: architecture
title: AWS database: DynamoDB
codes: [DDB]
verified: bbb105f
---

# AWS database: DynamoDB

Part of the [AWS adapter architecture](README.md). Markers, IDs and test references as defined there.

## Design

### Role

`@genoacms/adapter-aws/database` serves GenoaCMS collections from DynamoDB. Collection definitions,
static ones from the config and ones the operator stores under `.genoacms/collections` in the default
bucket, are core's concern. The adapter receives a reference carrying the collection's name and its
primary key.

### Decisions

**A table per collection, prepared by the operator (WU2; DDB-2).** A collection is the DynamoDB table
of the same name, with a partition key named after the collection's `primaryKey.key`, of type string,
and no sort key. The operator creates it when defining the collection. The adapter never creates,
changes or deletes a table.
*Why:* no CMS user can create a collection (WU2), so a table exists before anything reads it, and the
runtime role needs no right over tables themselves.
*Cost:* a collection defined without its table fails on first use with DynamoDB's
`ResourceNotFoundException`. Each table is provisioned, and billed, separately. The operator must
use the key name the collection declares.

**WD3. Only string keys (DDB-2, DDB-4).** A collection whose `primaryKey.schema.type` is not
`'string'` is refused.
*Why:* the contract's document IDs are strings, and the adapter generates them as UUIDs, which a
number key cannot hold (WF13).
*Cost:* an existing table with a number key cannot be served.

**Reads are strongly consistent (DDB-5, DDB-6).** A document read right after its write returns
that write.
*Why:* an editor who saves and reloads must see the save. Firestore gives that by default.
*Cost:* a strongly consistent read costs twice an eventually consistent one.

**Documents are plain JSON (DDB-3).** Strings, finite numbers, booleans, `null`, arrays and plain
objects. Numbers are read back as JavaScript numbers.
*Cost:* DynamoDB's sets and binary values are not supported, and a number stored by another tool with
more precision than a JavaScript number is rounded when read. An item holds at most 400 KB.

### Findings

| # | Finding | State |
| :-- | :-- | :-- |
| WF8 | **`getCollection` reads only the first page** (DDB-5). A single `Scan` returns at most 1 MB, and `LastEvaluatedKey` is ignored, so a larger collection is silently truncated. | open |
| WF9 | **`getDocument` of a missing document throws** `document-fetching-failed` (DDB-6), where the contract resolves `undefined`. | open |
| WF10 | **`updateDocument` replaces the whole item, and creates a missing one** (DDB-7). It sends `PutItem`, so fields not given are deleted, and updating a document that does not exist creates it. Firestore merges and fails on a missing document. | open |
| WF11 | **`createDocument` can overwrite a document** (DDB-4). The data is spread after the generated ID, so data carrying the key field replaces the ID, and `PutItem` has no condition, so it overwrites an existing document of that ID. | open |
| WF12 | **Snapshots disagree on the key attribute** (DDB-5, DDB-6). `getCollection` returns it inside `data`, `getDocument` removes it. | open |
| WF13 | **Numeric keys and non-JSON numbers fail late** (DDB-3, WD3). A number-key collection gets a UUID in its `N` key, which DynamoDB rejects, and `NaN` or `Infinity` become the string `"NaN"` or `"Infinity"` in an `N` value, which DynamoDB rejects. An `undefined` field throws `unsupported-type` instead of being omitted. | open |
| WF21 | **An update with no field to set succeeded on a missing document** (DDB-7, WS5). With empty data, or only `undefined` fields, no `UpdateItem` was sent, so the missing document went unreported. | open |
| WF22 | **A key field with an unsupported value failed a create** (DDB-4, WS5). The data was converted before the key was overridden, so `{ id: NaN }` threw `database/unsupported-value` although DDB-4 overrides the key field. | open |

### History

*History.* DynamoDB support dates from 2023-10. RFC-0007 moved the bodies into the runtime unchanged,
with one client per provider.

### Verification

- The opt-in conformance suite (`test/conformance.test.js`, `GENOACMS_TEST_AWS=1`) runs `@genoacms/conformance`'s database cases against a real table named by `GENOACMS_TEST_AWS_TABLE`, with the key `id`.

## Specification

### Descriptor

#### DDB-1 · Descriptor

Specifier `@genoacms/adapter-aws/database`, kind `database`. Runtime specifier `@genoacms/adapter-aws/database/runtime`. Options `region: string` (required) and `credentials?: Secret<AwsCredentials>`, decoded as JSON. Validation follows AWS-2 and AWS-3.

- Test: unverified (the tests name no statement, WF19)
- Level: unit

### Runtime

One `DynamoDBClient` per provider (AWS-4). Every error not named below propagates unchanged (WD2).

#### DDB-2 · Collections are tables

A collection reference `{ name, primaryKey: { key, schema } }` addresses the table `name`, whose partition key is the attribute `key`, of type string. Every method first refuses a collection whose `primaryKey.schema.type` is not `'string'`, with `database/unsupported-key-type: <name>`, before any request.

- Test: none yet
- Level: unit, contract
- State: new (RFC-0026)

#### DDB-3 · Values

A document's fields are written as DynamoDB attributes: a string as `S`, a finite number as `N` (its decimal string), a boolean as `BOOL`, `null` as `NULL`, an array as `L` and a plain object as `M`, recursively. A field whose value is `undefined` is omitted. Any other value, including `NaN`, `Infinity`, `undefined` in an array, a `bigint`, a `Date` or another class instance, throws `database/unsupported-value: <path>` before any request, where `<path>` is the field's dotted path, with array indexes as numbers. Read attributes convert back the same way, `N` as a JavaScript number.

- Test: none yet
- Level: unit, contract
- State: new (RFC-0026)

#### DDB-4 · Creating a document

`createDocument(ref, data)` sends `PutItem` of `data` with the key attribute set to a new `crypto.randomUUID()`, overriding a key field in `data`, and `ConditionExpression: 'attribute_not_exists(#key)'`. It returns `{ reference: { collection: ref, id }, data }`, where `data` is the input, not re-read.

- Test: none yet
- Level: unit, contract
- State: new (RFC-0026)

#### DDB-5 · Reading a collection

`getCollection(ref)` sends `Scan` with `ConsistentRead: true`, following `LastEvaluatedKey` until it is absent, and returns every item as `{ reference: { collection: ref, id }, data }`, where `id` is the key attribute and `data` is the item without it. The order is DynamoDB's scan order, which is not the order of IDs, unlike Firestore's.

- Test: none yet
- Level: unit, contract
- State: new (RFC-0026)

#### DDB-6 · Reading a document

`getDocument({ collection, id })` sends `GetItem` of the key with `ConsistentRead: true` and returns `{ reference, data }`, with `data` the item without its key attribute, or `undefined` when there is no item.

- Test: none yet
- Level: unit, contract
- State: new (RFC-0026)

#### DDB-7 · Updating and deleting

`updateDocument(ref, data)` sends `UpdateItem` that sets each field of `data` (DDB-3; an `undefined` field is left unchanged), with `ConditionExpression: 'attribute_exists(#key)'`, so it merges and fails with DynamoDB's `ConditionalCheckFailedException` when the document does not exist. A key field in `data` throws `database/key-immutable: <key>` before any request. It returns `{ reference: ref, data }` with the input `data`. `deleteDocument(ref)` sends `DeleteItem`; deleting a missing document is not an error.

- Test: none yet
- Level: unit, contract
- State: new (RFC-0026)
