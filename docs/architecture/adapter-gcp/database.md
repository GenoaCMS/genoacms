# GCP database: Firestore

Part of the [GCP adapter architecture](README.md). Markers and IDs as defined there.

## 1. Role

`@genoacms/adapter-gcp/database` serves GenoaCMS collections from Firestore in native mode. Options:
`projectId`, `databaseId?` (default `(default)`), and `credentials?`, which production omits (README
GU2). A project may hold several Firestore databases, and each provider names one.

## 2. Behavior (current)

- A GenoaCMS collection is a Firestore collection of the same name. Collection definitions, static ones from the config and dynamic ones stored under `.genoacms/collections` in the default bucket, are core's concern. The adapter receives only a reference with a name.
- `createDocument` uses Firestore's auto-generated IDs. `getDocument` returns `undefined` for a missing document. `updateDocument` is Firestore's `update`, a merge that fails when the document does not exist. `deleteDocument` deletes.
- There are no transactions and no queries. The contract has neither.

| # | Finding | Where |
| :-- | :-- | :-- |
| GF9 | **`getCollection` reads a whole collection.** Every document is fetched in one call, with no paging and no limit. Cost and latency grow with the collection, and a large one can exceed the function's memory. The contract offers no paging, so the fix belongs to the contract first. | `src/database/runtime.ts` |

**Isolation.** Any collection name reaches Firestore unchanged. A future identity store in Firestore
(`configuration.md` U13, deferred) must therefore live in a separate Firestore database that no
`databases` entry names, not in a reserved collection, because a CMS user who can define dynamic
collections could name one after it.

## 3. History

*History.* Firestore support predates the monorepo. RFC-0007 moved the bodies into the runtime
unchanged, with one client per provider, so two databases or two projects can be served at once.

## 4. Verification

The opt-in conformance suite (`test/conformance.test.ts`, `GENOACMS_TEST_GCP=1`) runs the database
contract against real Firestore with the operator's ADC.
