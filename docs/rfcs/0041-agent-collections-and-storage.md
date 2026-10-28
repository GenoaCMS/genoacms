---
type: rfc
number: 41
title: Agent tools for documents and objects, with documents validated by the service
status: draft
depends: [39, 40, 42]
architecture: [architecture/agent-access.md, architecture/collections.md, architecture/storage.md]
changes: [TOL-18 added, TOL-19 added, TOL-20 added, TOL-21 added, TOL-22 added, TOL-23 added, TOL-24 added, TOL-25 added, TOL-26 added, TOL-27 added, TOL-28 added, TOL-29 added, DOC-8 added, STS-7 added, DOC-3 compatible, DOC-5 breaking, TOL-1 editorial]
commit-subject: "feat(core): agent tools for documents and objects, with documents validated by the service (RFC-0041)"
---

# RFC-0041: Agent tools for documents and objects, with documents validated by the service

## Summary

Agents build components and pages through MCP (RFC-0039). The author wants them to fill
collections and buckets too (`agent-access.md` TU12 to TU15). This RFC:

1. Moves schema validation from the editor's remote commands into the document service, and
   validates an update as it will be stored (DOC-8; `collections.md` OD15). The editor answers as
   before (DOC-5), except that an update is now checked together with the fields it keeps.
2. Makes an update of a missing document fail with `documents/not-found` (DOC-3).
3. Adds signing one object's URL to the storage user layer (STS-7).
4. Adds 13 tools: six over collections and documents (TOL-18 to TOL-23), listing documents a page
   at a time through the database contract of RFC-0042, and seven over buckets,
   directories and objects (TOL-24 to TOL-28), with their permissions (TOL-29).
5. Documents the tools on the documentation site.

Document saves stay unconditional (TU13); uploads are inline and at most 4 MiB (TU14).

## Files

**Modify or create only:**

| File | Change |
| :-- | :-- |
| `packages/core/src/lib/script/database/errors.ts` | new: `DocumentValidationError`, `DocumentNotFoundError` |
| `packages/core/src/lib/script/database/validation.ts` | new: `validateDocument` |
| `packages/core/src/lib/script/database/user.server.ts` | DOC-8 in `createUserDocument` and `updateUserDocument`; DOC-3's not-found; TOL-19's unreadable fields in `getUserCollection` |
| `packages/core/src/lib/script/database/user.server.test.ts` | the DOC-3 and DOC-8 tests of §Tests |
| `packages/core/src/routes/(admin)/collections/[collectionName]/create.remote.ts`, `[documentId]/update.remote.ts` | validation removed; `DocumentValidationError` answered as invalid data |
| `packages/core/src/routes/(admin)/collections/[collectionName]/documents.remote.test.ts` | the two "schema rejects" tests changed as §Tests says |
| `packages/core/src/lib/script/storage/user.server.ts` | `getUserSignedURL` |
| `packages/core/src/lib/script/storage/user.server.test.ts` | the STS-7 tests |
| `packages/core/src/lib/script/mcp/tools/collections.server.ts` | new: TOL-18 to TOL-23 |
| `packages/core/src/lib/script/mcp/tools/storage.server.ts` | new: TOL-24 to TOL-28 |
| `packages/core/src/lib/script/mcp/tools/storageNames.ts` | new, pure: the object names and directory paths of the storage tools |
| `packages/core/src/lib/script/mcp/tools/registry.server.ts` | the 13 tools, after the 18 of RFC-0039 |
| `packages/core/src/lib/script/mcp/protocol.ts` | `DocumentValidationError`, `DocumentNotFoundError` among the refusal classes |
| `packages/core/src/lib/script/mcp/tools/collections.test.ts` | new: TOL-18 to TOL-23, TOL-29 |
| `packages/core/src/lib/script/mcp/tools/storage.test.ts` | new: TOL-24 to TOL-29 |
| `packages/core/src/lib/script/mcp/tools/storageNames.test.ts` | new: the names of the storage tools |
| `packages/core/src/lib/script/mcp/protocol.test.ts` | the expected tool list gains the 13 names |
| `packages/core/src/lib/script/testing/memoryDatabase.ts` | new: an in-memory database adapter for tests, to the database contract |
| `packages/docs/src/routes/reference/mcp/+page.md` | the 13 tools |
| `.changeset/agent-collections-storage.md` | new: `'@genoacms/core': minor` |
| `docs/architecture/agent-access.md`, `collections.md`, `storage.md`, `docs/README.md` | the statements current, after the code (§Steps) |

## Specification

### Added

The statements TOL-18 to TOL-29 of `agent-access.md`, DOC-8 of `collections.md` and STS-7 of
`storage.md`, as the architecture documents state them at the commit of this RFC.

### Changed

**DOC-3** (compatible): its last sentence, *When no document is stored, only the writable fields of
the submission are stored.*, becomes:

> An update of a document that does not exist fails with `documents/not-found: <collection>/<id>`,
> and nothing is written.

Both adapters already failed such an update with a raw error (`adapter-gcp/database.md` DB-7,
`adapter-aws/database.md` DDB-7); it is now typed and named.

**DOC-5** (breaking): its first paragraph becomes:

> The editor creates a document with the remote command `createDoc({ collectionName, documentData })`
> and updates one with `updateDoc({ collectionName, documentId, documentData })`. Each calls the
> document service, which validates the document (DOC-8). Each returns:

and the row *invalid data* reads *the service refuses the document as invalid (DOC-8)*. The table is
otherwise unchanged. Breaking because an update is now validated with the stored fields it keeps: a
document stored with a field its schema refuses, such as one `additionalProperties: false` no longer
allows, can no longer be saved from the editor until the field is valid.

**TOL-1** (editorial): *Every read tool returns* becomes *Every read tool of components and pages
returns*, and *Every tool that changes one of them* is unchanged.

### Core

`packages/core/src/lib/script/database/errors.ts`:

```ts
class DocumentValidationError extends Error {
  readonly errors: Array<{ instancePath: string, keyword: string }>
  constructor (errors: Array<{ instancePath: string, keyword: string }>)
  // message: 'documents/invalid: ' + errors.map(e => `${e.instancePath || '/'} ${e.keyword}`).join('; ')
}
class DocumentNotFoundError extends Error {
  constructor (collection: string, id: string)
  // message: `documents/not-found: ${collection}/${id}`
}
export { DocumentValidationError, DocumentNotFoundError }
```

`schemasafe` reports `instanceLocation` as a JSON pointer prefixed with `#` (`#/name`); the
`instancePath` above is it without the `#`, and `/` when that leaves it empty.

`packages/core/src/lib/script/database/validation.ts`:

```ts
/** DOC-8: throws DocumentValidationError when the document does not match the schema. */
function validateDocument (schema: JsonSchema, document: unknown): void
```

It builds the validator with `validator(schema, { formats, includeErrors: true, allErrors: true })`,
`formats` from `./validators`. Validators MAY be cached per schema object.

`packages/core/src/lib/script/database/user.server.ts`:

- `createUserDocument`: after `requireWrite`, `validateDocument(withoutRequiredKey(reference),
  document)`, where `withoutRequiredKey` returns the schema with `primaryKey.key` removed from its
  top-level `required`; then as today.
- `getUserCollection(ctx, reference, params)`: after `requireRead`, when `readable(ctx, name)` is not
  `'*'`, a condition of `params.where` on a field outside it throws
  `new Error('documents/unreadable-field: ' + field)` before the adapter is called.
- `updateUserDocument`: after `requireWrite`, read `current = await getDocument(reference)`; when it
  is `undefined`, throw `new DocumentNotFoundError(reference.collection.name, reference.id)`. The
  document to store is `{ ...current.data, ...document }` when every field is writable, otherwise
  `mergeDocument(current.data, document, fields)`; `validateDocument(reference.collection.schema,
  stored)`; then write: `updateDocument(reference, document)` when every field is writable (the
  adapter merges), `updateDocument(reference, stored)` otherwise, as today.

`create.remote.ts`, `update.remote.ts`: the `validator` import and the validation are removed. In
the `catch`, before the generic failure, `if (error instanceof DocumentValidationError) return {
status: 'fail', text: 'Invalid document data', errors: undefined }`. A `PermissionDeniedError` is
still thrown.

`packages/core/src/lib/script/storage/user.server.ts`:

```ts
/** STS-7 */
const getUserSignedURL = async (ctx: AuthContext, reference: ObjectReference): Promise<{ url: string, expiresAt: Date }>
```

It requires `storage:bucket:read` on `reference.bucket` (as `listUserDirectory` does), then calls
`getSignedURL(reference, expiresAt)` of the storage service with `expiresAt = new Date(Date.now() +
3_600_000)`.

### MCP

`packages/core/src/lib/script/mcp/tools/storageNames.ts`, pure:

```ts
/** Throws StorageToolError('storage/invalid-name', `storage/invalid-name: ${name}`) unless name is an object name of TOL-24's group. */
function requireObjectName (name: string): void
/** The same for a directory path: '' or an object name followed by '/'. */
function requireDirectoryPath (path: string): void
/** The same, refusing '' too (TOL-28's move and delete). */
function requireSubdirectoryPath (path: string): void
class StorageToolError extends Error { constructor (code: string, message: string) }
```

An object name: non-empty, not ending with `/`, and `name.split('/')` has no `''`, `.` or `..`.

`packages/core/src/lib/script/mcp/tools/collections.server.ts`, each `(ctx: AuthContext, args:
Record<string, unknown>) => Promise<unknown>`, as `pages.server.ts`:

| Function | Does |
| :-- | :-- |
| `listCollections` | `getUserCollectionReferences(ctx).map(name => ({ name }))` |
| `getCollection` | `getUserCollectionReference(ctx, collection)`, through a helper `referenceOf(ctx, collection)` the other tools share; an `Error` whose message is exactly `collection/not-found` is rethrown as `new Error('collection/not-found: ' + collection)`; returns `{ name, primaryKey, schema }` |
| `listDocuments` | the reference as `getCollection`; `getUserCollection(ctx, reference, { where, limit: limit ?? 50, pageToken })`; returns `{ documents: page.documents.map(s => ({ id: s.reference.id, data: s.data })), next }`, `next` omitted when absent |
| `getDocument` | `getUserDocument(ctx, { collection: reference, id })`; `undefined` throws `DocumentNotFoundError`; returns `{ id, data }` |
| `createDocument` | `createUserDocument(ctx, reference, data)`; returns `{ id: snapshot.reference.id }` |
| `updateDocument` | `updateUserDocument(ctx, { collection: reference, id }, data)`; returns `{ id }` |
| `deleteDocument` | as DOC-6: `getUserCollectionReference` (read), then `deleteUserDocument`; returns `{}` |

`packages/core/src/lib/script/mcp/tools/storage.server.ts`:

| Function | Does |
| :-- | :-- |
| `listBuckets` | `getUserBucketReferences(ctx).map(({ name }) => ({ name }))`, as STS-1 |
| `listDirectory` | `requireDirectoryPath(path ?? '')`; `listUserDirectory(ctx, { bucket, name: path }, { pageToken, limit })`; returns `{ files: files.map(f => ({ name: f.name, size: f.size, lastModified: f.lastModified.toISOString() })), directories: directories.map(d => d.name), next }` with `next` omitted when absent |
| `getObject` | `requireObjectName`; `getUserSignedURL`; returns `{ url, expiresAt: expiresAt.toISOString() }` |
| `uploadObject` | `requireObjectName`; decode (below); `uploadUserObject(ctx, ref, bytes, overwrite === true ? {} : { ifAbsent: true })`; a `PreconditionFailedError` becomes `StorageToolError('storage/exists', 'storage/exists: <bucket>/<name>')`; returns `{ name }` |
| `moveObject` | `requireObjectName` on both; `moveUserObject(ctx, ref, destination)`; returns `{}` |
| `deleteObject` | `requireObjectName`; `deleteUserObject`; returns `{}` |
| `createDirectory` | `requireDirectoryPath`; `createUserDirectory`; returns `{}` |
| `moveDirectory` | `requireSubdirectoryPath` on `path`, `requireDirectoryPath` on `destination`; `moveUserDirectory`; returns `{}` |
| `deleteDirectory` | `requireSubdirectoryPath`; `deleteUserDirectory`; returns `{}` |

Decoding for `uploadObject`: `encoding` absent or `utf8` gives `Buffer.from(content, 'utf8')`.
`base64` requires `content` to match `/^[A-Za-z0-9+/]*={0,2}$/` with a length divisible by 4, else
`storage/invalid-content: <name> is not base64`, then `Buffer.from(content, 'base64')`. A buffer
longer than `4_194_304` fails with `storage/too-large: <length> bytes exceed 4194304`. Checks run in
this order: name, content, size; then the upload.

`registry.server.ts`, appended in this order, with these input schemas (`object(...)` as today;
`identifier` for every name except `path` and `destination` of directories, which are `text`, since
`''` is the root):

| Tool | Description | Properties (required in bold) |
| :-- | :-- | :-- |
| `list_collections` | Lists the collections you hold a grant on. | — |
| `get_collection` | Reads a collection's schema and primary key. | **collection** |
| `list_documents` | Lists one page of a collection's documents, filtered by conditions on top-level fields; pass next back as pageToken. | **collection**, where (array of `{ field, operator: ==, !=, <, <=, >, >=, value: string, number, boolean or null }`), limit (integer 1–200), pageToken |
| `get_document` | Reads a document. | **collection**, **id** |
| `create_document` | Creates a document, validated against the schema. | **collection**, **data** (object) |
| `update_document` | Sets the given top-level fields of a document; the later save wins. | **collection**, **id**, **data** (object) |
| `delete_document` | Deletes a document. | **collection**, **id** |
| `list_buckets` | Lists the buckets you hold a grant on. | — |
| `list_directory` | Lists one page of a directory. | **bucket**, path, pageToken, limit (integer ≥ 1) |
| `get_object` | Returns a signed URL to fetch an object's contents from, valid for an hour. | **bucket**, **name** |
| `upload_object` | Stores an object of at most 4 MiB, as UTF-8 text or base64; refuses to replace one unless overwrite is true. | **bucket**, **name**, **content** (string), encoding (`utf8`, `base64`), overwrite (boolean) |
| `move_object` | Moves an object within its bucket. | **bucket**, **name**, **destination** |
| `delete_object` | Deletes an object. | **bucket**, **name** |
| `create_directory` | Creates a directory. | **bucket**, **path** |
| `move_directory` | Moves everything under a directory. | **bucket**, **path**, **destination** |
| `delete_directory` | Deletes everything under a directory. | **bucket**, **path** |

The doc comment of `toolRegistry` becomes *The 31 tools of TOL-2 to TOL-15 and TOL-18 to TOL-28,
in that order.*

`protocol.ts`: `REFUSAL_CLASSES` gains `DocumentValidationError` and `DocumentNotFoundError`. The
other new errors have coded messages, which are refusals already.

`testing/memoryDatabase.ts`: a database `Adapter` to `contracts/database.md`, over a `Map` per
collection name, built on `checkQuery`, `checkValues` and `matches` of
`@genoacms/contracts/database/query` (RFC-0042), ordering by ID; with `memoryDatabase.clear()`,
`memoryDatabase.set(collection, id, data)` and `memoryDatabase.get(collection, id)`. Tests mock
`$lib/script/database/providers.server` so that `adapterForCollection` returns it.

## Non-goals

- Uploads over 4 MiB, a signed upload URL, and content types (TU14).
- Removing a field from a document; conditional document saves (TU13).
- Creating or signing collection definitions.
- Caller-chosen order of documents (`contracts/database.md` CD12).
- Agent-only rules for `.genoacms/` (BU7).
- End-to-end tests of the new tools.

## Tests

All at level `unit` (vitest, project `node`). The tests are written first, marked `it.fails`, by a
session that has not seen the implementation (WORKFLOW §8.2). Tools are called through
`useTool` / `callTool` of `testing/mcp.ts`; storage is the memory storage of
`testing/memoryStorage.ts`; the database is `testing/memoryDatabase.ts` with the collection `test`
of `genoa.config/collections.js`. `agent` is a principal with the permissions a case names.

`packages/core/src/lib/script/database/user.server.test.ts` (database service stubbed, as today):

| Title | Given / when / then |
| :-- | :-- |
| `DOC-8: a creation the schema refuses is not written` | Given `test` and `{ id: 'not-a-uuid' }` (`format: uuid`); when created by a writer; then it fails with a message starting `documents/invalid: /id format` and `createDocument` was not called. |
| `DOC-8: an update is validated with the stored fields it keeps` | Given a stored document `{ name: 'a', isA: 'yes' }` and the submission `{ name: 'b' }`; when updated by an unrestricted writer; then it fails with `documents/invalid: /isA type` and `updateDocument` was not called. |
| `DOC-8: a restricted writer's update is validated as stored, without the fields it may not write` | Given a writer restricted to `name`, a stored valid document, and the submission `{ name: 'b', isA: 'yes' }`; when updated; then it succeeds and `updateDocument` received the stored document with `name: 'b'` and the stored `isA`. |
| `DOC-8: the permission is checked before validation` | Given a principal without `db:collection:write` and an invalid submission; when created; then it fails with `PermissionDeniedError`. |
| `DOC-3: an update of a missing document fails as not found and writes nothing` | Given no stored document `x`; when updated; then it fails with `documents/not-found: test/x` and `updateDocument` was not called. |

`packages/core/src/routes/(admin)/collections/[collectionName]/documents.remote.test.ts`: the two
tests `DOC-5: data the schema rejects answers Invalid document data, without errors, and stores
nothing` keep their titles and assertions about the answer; their *given* becomes a service that
throws `DocumentValidationError` from `createUserDocument` / `updateUserDocument`.

`packages/core/src/lib/script/storage/user.server.test.ts`:

| Title | Given / when / then |
| :-- | :-- |
| `STS-7: one object's URL is signed for an hour on read` | Given a principal with `storage:bucket:read` on `media` and the clock at T; when signing `media/a.png`; then the storage service's `getSignedURL` got that reference and T + 1 h, and the result is `{ url, expiresAt: T + 1 h }`. |
| `STS-7: signing without read is denied and signs nothing` | Given a principal with only `storage:bucket:write`; when signing; then `PermissionDeniedError`, and `getSignedURL` was not called. |

`packages/core/src/lib/script/mcp/tools/collections.test.ts`:

| Title | Given / when / then |
| :-- | :-- |
| `TOL-18: collections are listed from the catalog, and one is read with its schema` | Given an agent with `db:collection:read` on `test`; when `list_collections` and `get_collection({ collection: 'test' })`; then `[{ name: 'test' }]` and the definition's `name`, `primaryKey`, `schema`. |
| `TOL-18: an unknown collection fails as not found` | When `get_collection({ collection: 'absent' })` by an agent with `*` on collections; then `isError` with `collection/not-found: absent`. |
| `TOL-19: documents are listed a page at a time, filtered by conditions` | Given 120 documents, 30 of them with `isA: true`; when `list_documents` with no parameters, then with `next` as `pageToken` until absent, and with `where: [{ field: 'isA', operator: '==', value: true }]` and `limit: 20`; then pages of 50, 50 and 20 holding every document once, `next` absent on the last; then the 30 matching ones in pages of 20 and 10. |
| `TOL-19: a limit outside 1 to 200 is refused` | When `limit: 0` and `limit: 201`; then `tools/invalid-arguments`. |
| `TOL-19: a condition on a field the agent may not read is refused` | Given a reader restricted to `name`; when `list_documents` with a condition on `isA`; then `documents/unreadable-field: isA`, and the adapter's `getCollection` was not called. |
| `TOL-19, TOL-20: only readable fields are returned` | Given a reader restricted to `name`; when listing and reading; then each `data` has only `name`. |
| `TOL-20: a missing document fails as not found` | When `get_document({ collection: 'test', id: 'x' })`; then `documents/not-found: test/x`. |
| `TOL-21: a document is created, validated, and its id returned` | When `create_document` with a valid document, then with `{ isA: 'yes' }`; then `{ id }` of a stored document, then `documents/invalid: /isA type` and nothing more stored. |
| `TOL-22: an update sets only the given fields and the later save wins` | Given a stored `{ name: 'a', isA: true }`; when `update_document` with `{ name: 'b' }`, then with `{ name: 'c' }`; then `{ id }` each time and the stored `{ name: 'c', isA: true }`. |
| `TOL-22: an update of a missing document fails and writes nothing` | When `update_document({ collection: 'test', id: 'x', data: { name: 'b' } })`; then `documents/not-found: test/x` and no document `x` exists. |
| `TOL-23: a document is deleted, and a missing one is not an error` | Given a stored `d`; when `delete_document` of `d`, then of `d` again; then `{}` both times and `d` is gone. |
| `TOL-29: each collection tool demands its permission` | For each tool of TOL-29's collection rows, an agent lacking one listed permission gets `isError` starting `permission-denied:` and the database is unchanged; `list_collections` of an agent with no grant answers `[]`. |

`packages/core/src/lib/script/mcp/tools/storage.test.ts`:

| Title | Given / when / then |
| :-- | :-- |
| `TOL-24: buckets are listed, and a directory is listed one page at a time without URLs` | Given objects `a/1.txt`, `a/2.txt`, `a/b/3.txt` in the default bucket; when `list_buckets` and `list_directory({ bucket, path: 'a/' })`; then the bucket is listed, `files` are the two objects with `name`, `size` and an ISO `lastModified` and no `signedURL`, and `directories` is `['a/b/']`. |
| `TOL-25: an object is read through a signed URL that expires in an hour` | When `get_object({ bucket, name: 'a/1.txt' })` at T; then `url` is the memory storage's signed URL of it and `expiresAt` is T + 1 h as ISO 8601. |
| `TOL-26: text and base64 contents are stored as bytes` | When `upload_object` with `content: 'Návod 😀'`, then with the base64 of bytes `00 ff`; then the stored objects are those UTF-8 bytes and those two bytes. |
| `TOL-26: an existing object is replaced only with overwrite` | Given `a/1.txt`; when uploaded without `overwrite`, then with `overwrite: true`; then `storage/exists: <bucket>/a/1.txt` and the old contents, then the new contents. |
| `TOL-26: oversized and malformed contents are refused and nothing is written` | When `upload_object` with 4,194,305 bytes of `utf8` text, then with `encoding: 'base64'` and `content: 'no t'`; then `storage/too-large: 4194305 bytes exceed 4194304`, then `storage/invalid-content: <name> is not base64`, and no object exists. |
| `TOL-27: an object is moved and deleted, and a missing one fails as not found` | Given `a/1.txt`; when moved to `c/1.txt`, then deleted, then deleted again; then `{}`, `{}`, and `storage/not-found: <bucket>/c/1.txt`. |
| `TOL-28: directories are created, moved and deleted recursively` | Given `a/1.txt` and `a/b/3.txt`; when `create_directory('d/')`, `move_directory('a/', 'e/')`, `delete_directory('e/')`; then `{}` each time and nothing remains under `a/` or `e/`. |
| `TOL-28: the root cannot be moved or deleted` | When `move_directory` or `delete_directory` with `path: ''`; then `storage/invalid-name: ` and nothing changed. |
| `TOL-24 to TOL-28: changes under .genoacms are refused as STS-5 says` | Given an agent with every storage permission on the default bucket; when `upload_object` of `.genoacms/x` and `delete_directory('.genoacms/')`; then `storage/internal-read-only: .genoacms/x` and the same for the directory, and nothing changed. |
| `TOL-29: each storage tool demands its permission` | As the collection case, for TOL-29's storage rows; `list_buckets` of an agent with no grant answers `[]`. |

`packages/core/src/lib/script/mcp/tools/storageNames.test.ts`:

| Title | Given / when / then |
| :-- | :-- |
| `TOL-24: object names and directory paths are checked by level` | `a`, `a/b.txt`, `a b/ć.txt` pass as names; `''`, `a/`, `/a`, `a//b`, `./a`, `a/../b` fail with `storage/invalid-name: <name>`. `''` and `a/b/` pass as paths; `a`, `a//`, `../` fail. `''` fails as a subdirectory path. |

`packages/core/src/lib/script/mcp/protocol.test.ts`: the expected `tools/list` names gain the 13
tools, in the order of §MCP; the test's title and other assertions are unchanged.

## Steps

1. Commit the architecture changes (TOL-18 to TOL-29, DOC-8, STS-7 **New**), then this RFC,
   separately.
2. Once RFC-0042 is implemented, a session that has not seen the implementation writes §Tests, including
   `testing/memoryDatabase.ts`, marked `it.fails` where they fail today; `pnpm --filter
   @genoacms/core exec vitest run --project node` passes. Commit: `test(core): tests for the agent
   tools for documents and objects (RFC-0041)`.
3. Another session implements §Core and §MCP, removes the `it.fails` markers without changing an
   assertion, documents the tools on the site, and adds the changeset. A contradiction with reality
   is corrected in this RFC first (WORKFLOW §8.2). Commit with the `commit-subject`.
4. Update the architecture documents: the statements current with their test files; DOC-3, DOC-5,
   DOC-8 and TOL-1 to §Specification's text; the History of each document; `docs/README.md`; this
   RFC `implemented` with its commits. Commit: `docs: agent tools for documents and objects current
   (RFC-0041)`.
5. A falsification audit of every statement this RFC adds or changes, by an agent that wrote none of
   it, recorded as a Verification entry in `agent-access.md`; each counterexample a finding.

## Verification

```bash
pnpm --filter @genoacms/core run adapters
pnpm --filter @genoacms/core exec vitest run --project node
# all pass
pnpm --filter @genoacms/core exec eslint src/lib/script/mcp src/lib/script/database src/lib/script/storage "src/routes/(admin)/collections"
# no errors
pnpm --filter @genoacms/core run check
# no error in a file of §Files (the baseline has 39 elsewhere)
pnpm --filter @genoacms/docs run build
# builds
node docs/tools/check-docs.mjs docs
# 0 error(s)
```

## Critique

**Pros**
- Agents fill collections and buckets through the services the screens use, so every permission,
  field restriction and `.genoacms/` rule holds for them without a rule of their own.
- Validation moves to where every caller passes; the editor and the tools refuse the same
  documents, and a partial update is checked as it will be stored.
- An update of a missing document is a named failure rather than an adapter's raw error.
- No contract changes: the tools sit on operations every adapter already has.

**Cons & trade-offs**
- DOC-5 is breaking: a stored document that its schema refuses can no longer be saved from the
  editor until it is fixed, so core rises to 0.4.0, not 0.3.1.
- Every update now reads the stored document first, one more database read per save.
- `list_documents` waits for RFC-0042: its pages and conditions are the database contract's, with
  its costs (`contracts/database.md` CD12, CD13), DynamoDB scanning a whole table for a selective
  query among them.
- Saves are last write wins (TU13), and a field cannot be removed (TD7).
- Uploads stop at 4 MiB and carry no content type, so the store serves them as its default type.

**Blindspots & missed edge cases**
- A validation error names the path of a field the principal may not read (a restricted writer's
  stored field), though not its value.
- A creation is validated before DOC-4 drops unwritable fields, so a restricted creator can still
  store a document missing a required field, as today.
- `get_object` signs a URL for an object that does not exist; the agent learns it only from the
  store's 404.
- `upload_object` with `overwrite: true` is unconditional: an agent and a person replacing one file
  at once lose one of the two.
- `delete_directory` on a large prefix runs inside one request and can time out part-way, leaving
  part deleted.
- An agent can read every user's email and roles from `.genoacms/` when it may read the default
  bucket (BU7), and can be steered to by content it processes.
- No end-to-end test runs a tool against a real database or bucket.
