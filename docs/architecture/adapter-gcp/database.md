# GCP database: Firestore

Part of the [GCP adapter architecture](README.md). Markers, IDs and test references as defined there.
Statement code: `DB`.

# Design

## 1. Role

`@genoacms/adapter-gcp/database` serves GenoaCMS collections from Firestore in native mode. A
project may hold several Firestore databases, and each provider names one.

Collection definitions, static ones from the config and dynamic ones stored under
`.genoacms/collections` in the default bucket, are core's concern. The adapter receives only a
reference carrying a collection name.

## 2. Decisions

**Names pass through unchanged (DB-3).** A GenoaCMS collection is the Firestore collection of the same
name. So any collection name reaches Firestore. A future identity store in Firestore
(`configuration.md` U13, deferred) must therefore live in a separate Firestore database that no
`databases` entry names, not in a reserved collection, because a CMS user who can define dynamic
collections could name one after it.

## 3. Findings

| # | Finding | State |
| :-- | :-- | :-- |
| GF9 | **`getCollection` reads a whole collection** (DB-5): every document in one call, with no paging and no limit. Cost and latency grow with the collection, and a large one can exceed the function's memory. The contract offers no paging, so the fix belongs to the contract first. | open |
| GF13 | **The runtime's methods are untested by unit tests.** Only construction (DB-2) is. DB-3 to DB-7 rely on the opt-in conformance suite. | open |

## 4. History

*History.* Firestore support predates the monorepo. RFC-0007 moved the bodies into the runtime
unchanged, with one client per provider, so two databases or two projects can be served at once.

## 5. Verification

The opt-in conformance suite (`test/conformance.test.ts`, `GENOACMS_TEST_GCP=1`) runs
`@genoacms/conformance`'s database cases against real Firestore with the operator's ADC.

# Specification

## S1. Descriptor

| # | Statement | Test |
| :-- | :-- | :-- |
| DB-1 | Specifier `@genoacms/adapter-gcp/database`, kind `database`. Runtime specifier `@genoacms/adapter-gcp/database/runtime`. Options `projectId: string` (required), `databaseId?: string`, `credentials?: Secret<ServiceAccount>` decoded as JSON. Validation follows COM-2 and COM-3. | `database/descriptor.test.ts` › both cases |

## S2. Runtime

| # | Statement | Test |
| :-- | :-- | :-- |
| DB-2 | One `Firestore({ projectId, databaseId, credentials? })` client per provider (COM-4). `databaseId` defaults to `(default)`. Without `credentials`, none is passed. | `database/runtime.test.ts` › defaults the database id to '(default)'… |
| DB-3 | A collection reference `{ name }` addresses the Firestore collection `name` in that database. No prefix, no mapping. | conformance (all database cases) |
| DB-4 | `createDocument(ref, data)` adds a document with a Firestore-generated ID and returns `{ reference: { collection: ref, id }, data }`, where `data` is the input, not re-read. | conformance: is creating a document |
| DB-5 | `getCollection(ref)` reads every document of the collection in one query and returns them as `{ reference, data }` snapshots, ordered by document ID, Firestore's default. | conformance: lists collection |
| DB-6 | `getDocument({ collection, id })` returns `{ reference, data }`, or `undefined` when the document does not exist. | conformance: is getting a document; is getting a document again |
| DB-7 | `updateDocument(ref, data)` is Firestore's `update`: a merge of the given fields that fails when the document does not exist. It returns `{ reference: ref, data }` with the input `data`. `deleteDocument(ref)` deletes, and deleting a missing document is not an error. Errors propagate. | conformance: is updating a document; is deleting a document |
