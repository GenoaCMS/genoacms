---
type: architecture
title: Collections
prefix: O
codes: [COL, DOC, LST, EDT, PCK]
verified: 813d2b5
---

# Collections

## Design

### Role

Collections are GenoaCMS's structured content: named sets of documents, each described by a JSON
Schema, stored by whichever database adapter the configuration routes the collection to. This
document covers what core does with them: where collection definitions come from, the
permission-checked document service, the collection listing with its selection and bulk deletion,
the document page and its schema-driven editor, and the pickers through which a document field
references storage objects or other documents.

```
genoa.config  ──collections──▶ host.collections ────────────────────┐
default bucket .genoacms/databases/<db>/collections/<name>, signed ─┴─▶ catalog (COL)
                                                                    │
route  ──AuthContext──▶ document service (DOC) ──▶ host.databaseForCollection / databaseNamed ──▶ adapter
                          read: project fields · write: merge fields · create: drop fields
                                                        │
UI: /collections ─▶ /collections/<name> (LST) ─▶ /collections/<name>/<id> (EDT)
                       ▲ picker mode (?selectionId)        │ reference / file field
                       └──────── BroadcastChannel (PCK) ◀───┘
```

Out of scope, and specified elsewhere or not yet at all: the configuration format that declares
collections ([`configuration.md`](configuration.md)), how the host routes a collection to a
database provider ([`host.md`](host.md)), what each database adapter stores
([`adapter-gcp/`](adapter-gcp/README.md), [`adapter-aws/`](adapter-aws/README.md)), and the grant
model behind the permissions this document names (no document yet). The storage browser, which
answers the file pickers of PCK, is [`storage.md`](storage.md).

### Decisions

| # | Decision | Where |
| :-- | :-- | :-- |
| OU1 | 2026-10-10: collections get an architecture document of their own, written from the code as it is after the editor redesign (`d6bf7aa`, `2fc5670`). | this document |
| OU2 | 2026-10-10: the document editor is redesigned: labelled fields with a type hint, compact fields sharing a row, list items as collapsible cards, labelled pickers, a save state on the document page, and a warning before leaving unsaved changes. | OD7 to OD10; EDT-1 to EDT-12, PCK-4 |
| OU3 | 2026-10-11: dynamic collections mirror the configuration's `databases.<key>.collections`: a definition lives in a directory of the database that serves it, and dynamic collections only add collections; a configured collection cannot be redefined. They reach collections that already exist in a database, and are not a way to create them. | OD12; COL-1, COL-2, COL-6 |
| OU4 | 2026-10-11: a dynamic definition is signed by core with a subordinate key, bound to its database and name, as the authorization manifests are; one that does not verify is listed and refused when opened. Core signs definitions through an administration screen that a later RFC adds. Core lists the collections directories and does not create them. | OD13; COL-1, COL-2, COL-7 |
| OU5 | 2026-10-11: the listing is redesigned for recognising documents: one line per row, the lead field first, each cell shown by its field's kind, and a filter over the documents loaded. | OD14; LST-1, LST-3, LST-7, LST-8 |

**OD1. Permissions are checked by the document service, per collection (DOC-1).** Every operation
takes the principal's `AuthContext` and checks `db:collection:read`, `write` or `delete` on the
collection's name before reaching the adapter. A route cannot forget the check, because the service
cannot be called without the context.
*Why:* a check at each route is one check missed away from a hole; a check in the service is where
every caller already passes.
*Cost:* the service imports the authorization layer, so it cannot be tested without a context.

**OD2. Field restrictions are applied after fetching and merged on write (DOC-2 to DOC-4).** A grant
MAY name the fields it covers. Reads drop the fields that are not readable after the adapter returns
them; updates by a restricted writer merge the submission into the stored record; creation drops
unwritable fields.
*Why:* not every adapter can select fields, so projecting in core gives every adapter the same
guarantee. A submission without a field the writer may not see must not erase it: the omission is
the absence of permission, not an instruction to clear the value.
*Cost:* restricted data passes through the CMS process, and a restricted update reads the record
before writing it.

**OD3. The catalog lists every collection the principal holds any grant on (COL-3).** Not only the
readable ones.
*Why:* a principal who may write a collection but not read it still needs to see where their writes
go, and navigation should not offer names that lead only to a denial.
*Cost:* a write-only principal sees a collection whose listing is then refused.

**OD4. Controls a principal may not use are hidden, and the service refuses them regardless
(LST-2, EDT-1).** New document, Delete and Save are shown only to a principal holding the permission.
*Why:* the toolbar shows what the user can do; the service is the boundary.
*Cost:* none beyond the extra permission lookups when rendering.

**OD5. Bulk deletion trusts nothing about the submitted ids but that they are ids (DOC-7).** Each id
becomes a reference on the collection named in the route, and each deletion makes the same check a
single deletion makes.
*Why:* a submitted id cannot address a document elsewhere, and selecting several is never a way to
act on what one at a time would be refused.
*Cost:* one permission check and one adapter call per document.

**OD6. In the listing toolbar, Delete stands before Select all (LST-2).** The toolbar is anchored to
the right, so a control that appears pushes the ones before it to the left.
*Why:* with Delete after it, Delete would appear exactly where Select all had just been clicked, and
a second click on the same spot would delete. The storage browser orders its toolbar the same way.
*Cost:* none.

**OD7. One classification of a field's schema drives both its control and its layout (EDT-4,
EDT-6).** The kind of a field (reference, uuid, text, markdown, enum, string, number, boolean,
references, files, file, list, object, const) is decided once, in a fixed order of precedence, and
both the input chosen and the label, hint and width read it.
*Why:* two separate chains of conditions, one for the input and one for the layout, come to disagree
about the same schema.
*Cost:* a new kind of field is added in one place, which every consumer must then handle.

**OD8. Compact fields share a row; the others take the full width (EDT-6).** References, files,
numbers, booleans, choices, strings and UUIDs take half the width when the editor is at least 36rem
wide; text, markdown, lists, groups and multiple references or files take all of it. Fields keep the
schema's order.
*Why:* a full-width input for a two-digit number is most of what made the old editor hard to scan.
Keeping the schema's order keeps the tab order and the author's grouping.
*Cost:* a compact field followed by a wide one leaves half a row empty. The width is measured on the
editor, not the window, so the same rule holds in the New document dialog.

**OD9. A list item that is an object is a collapsible card with a summary (EDT-11).** Its header
shows the position, the variant and the first non-empty text of the item.
*Why:* a list of open forms is unreadable past two items; a summary lets the author find an item
without opening each.
*Cost:* the summary is a guess at the most identifying field, and is raw text: a markdown field shows
its markup.

**OD10. Leaving with unsaved changes uses the browser's own dialog (EDT-3).** The shared guard asks
with `window.confirm` for navigation inside the CMS and through `beforeunload` for leaving the page.
*Why:* the CMS's own confirmation resolves a promise, and navigation cannot wait for one. Cancelling
and re-issuing the navigation afterwards would work for links and break the back button.
*Cost:* the dialog does not look like the rest of the CMS.

**OD11. A picker is a second tab of the ordinary browser, talking over a BroadcastChannel (PCK-1,
PCK-2).** The storage browser and the collection listing are the same screens whether or not they
were opened to pick something; a `selectionId` in the URL turns the picker controls on.
*Why:* the browsers already list, filter and navigate; a picker that reused none of it would be a
second, weaker browser. One protocol serves both kinds of picker.
*Cost:* the picker is a separate tab, and a picker opened from a closed editor has no one to answer
it.

**OD12. A dynamic collection lives in the directory of its database, and only adds a collection
(COL-1, COL-2, COL-6).** Its definition is the file
`.genoacms/databases/<database>/collections/<name>` of the default bucket, for a database the
configuration has. A name the configuration declares is defined there and nowhere else, and a file
of that name is ignored.
*Why:* the bucket takes the shape the configuration already has, `databases.<key>.collections`, so
where a file lives says which database serves it, with no field to forget and no default to guess.
A collection defined in one place cannot have a schema in one and a database in the other.
*Cost:* a configured collection's schema cannot be adjusted without a deploy, and moving a dynamic
collection to another database means moving its file. Each database's directory is listed at
process start.

**OD13. A dynamic definition is signed, and verified when it is opened (COL-2, COL-7).** The file
is an envelope signed by a subordinate key, whose payload names the database and carries the
definition with its name. A file that does not verify keeps its name in the catalog, and opening it
fails closed with `collection/unverifiable`.
*Why:* a definition decides which collection of which database the CMS exposes, and with which
schema: the authority the signed authorization manifests and page tree carry. Write access to the
bucket should not grant it. Binding the database and the name stops a signed file from being moved
or renamed into another meaning. Verifying on open keeps startup to one listing.
*Cost:* only core can sign, so a definition is written through the CMS, not by hand; a revoked key
leaves its definitions unverifiable until re-signed; the catalog can show a name that cannot be
opened; each open verifies a signature. The signature binds the database and the name, not a
version, so whoever can write the bucket can put back an older definition that core once signed
under the same database and name.

**OD14. The listing is for recognising a document, not reading it (LST-1, LST-7, LST-8).** Every
row is one line high. Each cell shows a short form of its value, chosen by the field's kind, the
same classification the editor uses (OD7). The lead field, the first text-like one, comes first and
names the row. A filter narrows the rows already loaded.
*Why:* a row's job is to be found and told apart from its neighbours; reading a value in full is the
document page's job, one click away. A row as tall as its longest value pushes every other document
off the screen, and a raw value such as `[object Object]` tells nothing. Rows of one height let the
eye run down a column.
*Cost:* long values are cut short, and seeing one whole needs a hover or opening the document. The
summary of an object is a guess at what identifies it. The filter searches only what is loaded and
shown, so its meaning changes once the listing pages (OF8).

### Findings

Found on 2026-10-10 by reading the code at `2fc5670`, and not reproduced, unless the row says otherwise.

| # | Finding | State |
| :-- | :-- | :-- |
| OF1 | **The document selection outlives the collection it was made in.** It is one module-level instance (`database/SelectionRune.svelte.ts`) shared by every listing and never cleared on navigation. Selecting documents in one collection and opening another keeps them selected: the second listing shows Delete, and confirming it posts the first collection's ids to the second collection's delete action (DOC-7), which deletes any documents there with the same ids. | open |
| OF2 | **A principal who may write a field but not read it erases it by saving.** The field is projected away on read (DOC-2), the editor fills the missing value with its default (EDT-5), and the update writes that default over the stored value, because the field is writable (DOC-3). | open |
| OF3 | **The editor writes defaults into every document it opens (EDT-5).** A field missing from a stored document gets `''`, `0` or `false`, and a missing object an object of those, as soon as the editor mounts, and the next save stores it. A document saved once can no longer be told apart from one whose author entered those values. | open |
| OF4 | **Some schemas render no control.** `type: 'integer'`, a type list such as `['string', 'null']`, and any schema matching no kind of EDT-4 render nothing, not even their label, and their value is kept unchanged. | open |
| OF5 | **`primaryKey` is declared but not used by core.** Documents are addressed by the id the adapter assigns (DOC-6). A property named like `primaryKey.key` is an ordinary editable field, although the end-to-end helper `tests/support/collections.ts` says the primary key is not editable. | open |
| OF6 | **`uiSchema` is read but not declared.** The listing hides columns marked `uiSchema[<field>].showPreview === false` (LST-1), but `CollectionReference` has no `uiSchema`, so the option is invisible to a config author's types and is a type error in core. | open |
| OF7 | **A reference field keeps its target collection in the JSON Schema `description`** (COL-5). An author who documents the field with a description changes what it references. | open |
| OF8 | **The listing reads the whole collection.** No query parameters reach the adapter (LST-1). The select-all control's comment says the listing is paginated; it is not. | open |
| OF9 | **Dynamic collections are listed once, at process start (COL-1).** A definition added to `.genoacms/collections/` while the CMS runs can be opened by its URL, because a definition is resolved on demand (COL-2), but is missing from the catalog until a restart. A dynamic definition with the name of a configured collection replaces it on resolution, while the catalog lists the name twice. | open; the replacement and the repeated name fixed, RFC-0035 |
| OF10 | **A failed validation tells nobody which field failed.** schemasafe is created without `includeErrors`, so the result's `errors` is always `undefined` (DOC-5); the page shows only "Invalid document data" and logs nothing useful. Shown on 2026-10-10 by the unit tests. | open |
| OF11 | **Clearing a number field stores `0` (EDT-7).** An empty input is read as `Number('')`. | open |
| OF12 | **The collections page title is not a heading.** It is written as an `<hi>` element, so it has no heading role. | open |
| OF13 | **The save shortcut ignores the write permission.** Ctrl+S or ⌘+S submits an update (EDT-2) on a page whose Save button is hidden from the principal; the service refuses it (DOC-1), and the page reports the refusal as a failed save. | open |
| OF14 | **A choice cannot be unset.** Once an option of an enum field is chosen, choosing it again, clearing the text or typing something else keeps it (EDT-8), so an optional choice cannot be returned to no value. Shown on 2026-10-10 in Chromium. | open |
| OF15 | **A collection that exists only as a dynamic definition cannot hold documents.** The host routes a collection to a database by the names its configuration declares, so every document operation on a dynamic-only collection fails with `database/not-found`, although its definition resolves (COL-2). Only a dynamic definition that shares the name of a configured collection works, by replacing its schema. Found by reading `config/src/host/routing.ts` on 2026-10-10. | fixed, RFC-0035 |
| OF16 | **The markdown preview is empty until the field is edited (EDT-10).** The preview is rendered on the server without DOMPurify, which needs a browser, so the server sends an empty preview, and Svelte does not repair `{@html}` content when it hydrates. Shown on 2026-10-10 in the built core in Chromium. | fixed, RFC-0035 |
| OF17 | **Dynamic collections are never listed with the GCP adapter (COL-1).** Core lists the directory `.genoacms/collections` without a trailing `/`; Cloud Storage, listing with the delimiter `/`, then answers with that directory as one prefix rather than the files in it. Shown on 2026-10-10 against a real bucket. | fixed, RFC-0035 |
| OF18 | **Icons are part of accessible names.** Bootstrap Icons draw their glyph with CSS `::before`, and Chromium includes it in the accessible name, so a list item's header is announced as a private-use character followed by `#1 …`, and a catalog card as one followed by its name. Shown on 2026-10-10 in Chromium. | open |
| OF19 | **A tall list item can hardly be dragged past its neighbour (EDT-11).** svelte-dnd-action places the dragged item by its centre, and while dragging it renders the item's placeholder as a new card, which is open even when the item was collapsed. An open card taller than the window must be carried past the centre of the next one, beyond the window's edge. Shown on 2026-10-10 in the built core in Chromium: a hero section 627 px tall moved only when the window was 2400 px tall. | open |
| OF20 | **Core does not exit on SIGTERM once it has used Firestore.** The Firestore client keeps the Node process alive after the server closes, so the end-to-end harness kills it after 5 s; a platform that sends SIGTERM before SIGKILL waits its whole grace period. Shown on 2026-10-10 by the end-to-end run. | open |
| OF21 | **The `storageResource` format checks nothing a storage field holds (DOC-5).** schemasafe applies formats to strings only, so the format refuses every string and accepts any object, including one without `name`; the schemas of COL-5 do not use the format at all. Shown on 2026-10-10 with schemasafe. | open |
| OF22 | **A dynamic definition can name another collection than its file (COL-1, COL-2).** The catalog and the route use the file name, but resolution returns the definition as stored, and every document operation, its permission check included, uses the `name` inside it. A file `foo` whose definition is named `articles` is listed as `foo` and reads and writes `articles`, configured or not, with the schema of `foo`, for a principal holding grants on both. Found by reading `database/database.server.ts` and `database/user.server.ts` on 2026-10-11. | fixed, RFC-0035 |
| OF23 | *History.* **A missing directory is created with a double slash (COL-1).** `listOrCreateDirectory` hands `createDirectory` the name it listed, which ends in `/`, and the GCP and AWS adapters append `/.folderPlaceholder` to it, so `.genoacms/databases/<database>/collections//.folderPlaceholder` is written: a subdirectory with an empty name that the storage browser shows. The next listing then finds that subdirectory, so the directory counts as existing. Publications create their directories the same way. Shown on 2026-10-11 by the falsification audit of RFC-0035 with a mocked GCS bucket. | fixed, RFC-0037 |
| OF24 | *History.* **Only the first page of a directory is listed (COL-1).** Neither the storage contract nor the GCP and AWS adapters page a listing, and Cloud Storage and S3 answer at most 1000 entries, so a database directory of more than 1000 definitions loses the rest from the catalog. `genoa database` lists the same way (CLI-10). Found by the falsification audit of RFC-0035 on 2026-10-11 by reading the code. | fixed, RFC-0037 |
| OF25 | **Some definition files are not listed as files, depending on the adapter (COL-1).** Every adapter hides an object whose name ends in `.folderPlaceholder`, so such a definition is never listed; the MinIO adapter lists an object named exactly `.../collections/`, the marker S3 tools create for a directory, as a file, which becomes a collection named `collections`. Found by the falsification audit of RFC-0035 on 2026-10-11 by reading the code. | open |
| OF26 | **Key order puts integer-like keys first (COL-1, COL-6).** Database keys are taken in JavaScript property order, so with `databases: { main, '2024' }`, `2024` is listed first and wins a name both directories hold, against the order the configuration declares them in. Found by the falsification audit of RFC-0035 on 2026-10-11 by reading the code. | open |
| OF27 | **A key revoked by another process keeps verifying until a restart (COL-7).** The key cache re-reads the registry only for a key id it does not know, or after its own process revokes a key, so a revocation published by another instance is not seen by a running one, and definitions signed with that key keep resolving there. The same holds for every signed document. Shown on 2026-10-11 by the second falsification audit of RFC-0035 with a probe of `signing/keyResolver.ts`. | open |
| OF28 | **A key the registry lists can be refused (COL-2, COL-7).** The key cache answers an unknown key id without reading the registry once its refresh budget (20 in 10 s) is spent, or for 60 s after it found the id absent; envelopes naming random key ids, which anyone who can write the bucket can place, spend the budget, and a definition signed by a key just rotated in elsewhere then fails as `collection/unverifiable`. Shown on 2026-10-11 by the second falsification audit of RFC-0035 with a probe of `signing/keyResolver.ts`. | open |
| OF29 | *History.* **A storage outage reads as a missing definition (COL-2).** Any failure to read a dynamic definition becomes `collection/not-found`, a transient outage included, while a registry that cannot be read propagates its error. Telling the two apart needs the storage contract to distinguish a missing object. Found by the second falsification audit of RFC-0035 on 2026-10-11 by reading the code. | fixed, RFC-0037 |

### History

*History.* Until 2026-10-10 (`d6bf7aa`, `2fc5670`) the editor stacked every field at full width under
a `name:` label, rendered every object, nested or not, with a drag handle and a Delete menu, showed
pickers as icon-only buttons with a bare `n / ∞` counter, and the document page was titled
"Update <id> of <collection>" with an icon-only save. Dragging a list item started only when the
press landed on the grip glyph: svelte-dnd-action ignores a press whose target has a `value`, which
a `<button>` handle does.

### Verification

All 38 statements name tests, each verified in full.

- **`unit`, in Node.** DOC-1 to DOC-4 are tested through the document service with only the adapter
  stubbed, DOC-5 through `createDoc` and `updateDoc` with the service stubbed and validation real,
  DOC-7 through the listing's action, COL-3 and COL-4 on the functions core reads definitions with,
  COL-5 on `@genoacms/contracts/schemas`. COL-1, COL-2, COL-6 and COL-7 are tested on the database
  service with the storage, the key resolution and the host stubbed, and real ML-DSA-65 signatures.
  LST-1, LST-7 and LST-8 on the listing's pure functions: columns, cells, filtering and the count.
- **`unit`, in Chromium.** EDT-4, EDT-5, EDT-7 to EDT-9, EDT-12 and PCK-3 are tested on the mounted
  editor through Vitest browser mode, with real input events and, for PCK-3, a real
  `BroadcastChannel` on which the test plays the picker tab.
- **`e2e`.** `packages/core/e2e/collections.test.ts` builds core with `genoa.config/e2e.ts`, serves it
  with an administrator and a principal who may only read `test`, and drives it in Chromium through
  Playwright. Fixtures are written to Firestore through the GCP adapter, not through the CMS, and
  removed afterwards, and two files are written to the root of the bucket for the files picker;
  failures are injected by answering the remote commands and form actions in the browser, never by
  breaking the server. Dynamic definitions are written to the bucket around a first start of the
  server, which creates the instance's keys: under a configured name and under a database the
  configuration lacks before it, then one signed with the instance's current subordinate key, read
  from the build's secrets file, and one unsigned; the server is then started again. It needs GCP: `GENOACMS_TEST_GCP=1`, Application Default Credentials (or
  `GOOGLE_APPLICATION_CREDENTIALS`), `GENOACMS_TEST_GCP_PROJECT` and `GENOACMS_TEST_GCP_BUCKET`,
  defaulting to `genoacms` and `genoacms-tests`; run it with
  `pnpm --filter @genoacms/core exec vitest run --mode e2e e2e`. It was first run on 2026-10-10,
  locally, against `genoacms-tests`.

A falsification audit, by an agent that did not write the code, of LST-1, LST-3, LST-7 and LST-8 for
RFC-0036, on 2026-10-11: markdown cells showed HTML entities, dropped tables and merged words across
list items and line breaks, and the filter folded case only as far as `toLowerCase`; suspected, the
filter outliving its collection, rows without columns, an unlabelled check mark and unbounded narrow
columns. Each was fixed before the code was committed. That a selection outlives the filter, and
that `true` or `item` match every row with a boolean or a count, conform and are named in the RFC's
critique.

Falsification audits, by an agent that did not write the code, of COL-1, COL-2, COL-6, COL-7,
CLI-10 and EDT-10 for RFC-0035, on 2026-10-11, twice: before signing, a definition that was not a
JSON object resolved and a missing directory was created with a double slash; after signing, a
payload with other fields verified. Each was fixed before the code was committed. Envelopes of
another type, tampered, re-typed or re-keyed envelopes, and definitions replayed under another name
or database were all refused, and no route reaches the document service for an unverifiable
definition. What remains is recorded as OF23 to OF29, and `cli.md` LF17 and LF18.

Self-checks, by the agent that wrote the tests, not falsification audits: on 2026-10-10, mutants of
the service that skip the projection, the merge or the dropping of fields (DOC-2 to DOC-4), and
mutants of the reference, file and editor components (PCK-3, EDT-9), each failed a test.

Older tests that check statements without carrying their IDs:

- `packages/core/src/lib/script/authorization/fields.test.ts` (unit): the field rules behind DOC-2 to
  DOC-4, as pure functions; the statements are verified through the service instead.
- `packages/core/src/lib/script/database/collections.test.ts` (unit): schemasafe with core's formats
  against the example collections.
- `packages/core/tests/collections.spec.ts`, `tests/selection.spec.ts` (Playwright): creating,
  reopening, saving, deleting and bulk-deleting documents. They need the development credentials, do
  not run in CI, and are not a level of `docs/README.md`.

The editor redesign was checked on 2026-10-10 in a throwaway Vite page rendering the editor with a
mock schema: rendering of every kind, collapsing, adding and removing items, reordering by
step-wise mouse events, the item summary, the save state, and a phone-width layout.

## Specification

### Catalog

#### COL-1 · Where collections come from

The catalog is the configured collections, in configuration order across every database
(`host.collections`), followed by the dynamic collections: one per file in the directory
`.genoacms/databases/<database>/collections/` of the default bucket, following every page of its
listing (`contracts/storage.md` STOR-11), for each database of the configuration in key order, named by the file name, in the order the storage lists them, whether
or not its definition verifies. A name the configuration declares, or that an earlier directory
already gave, is left out. No other directory is listed, and none is created. The directories are
listed once, when the server process starts, all at once. Nothing is listed while SvelteKit
analyses the build.

- Test: `packages/core/e2e/collections.test.ts`, `packages/core/src/lib/script/database/database.server.test.ts`
- Level: unit, e2e

#### COL-2 · Resolving a definition

A configured collection's name resolves to the first configured definition of that name, and the
bucket is not read. A dynamic collection's name resolves to the definition in the file it was
listed from, read and verified each time it is resolved (COL-7). When that file does not exist
(`contracts/storage.md` STOR-16) or does not parse, or the name is neither configured nor dynamic,
resolution fails with the error `collection/not-found`; any other failure to read it propagates
unchanged. When the file parses but is not a verified definition of that database
and name, resolution fails with an error whose message starts with `collection/unverifiable`.
When the key registry cannot be read, its error propagates.

- Test: `packages/core/e2e/collections.test.ts`, `packages/core/src/lib/script/database/database.server.test.ts`
- Level: unit, e2e

#### COL-3 · The catalog a principal sees

`/collections` lists, as links to `/collections/<name>`, the names of the catalog on which the
principal holds any grant whose resource is that collection, whatever its permission.

- Test: `packages/core/src/lib/script/database/user.server.test.ts`, `packages/core/e2e/collections.test.ts`
- Level: unit, e2e

#### COL-4 · A collection definition

A definition is a `CollectionReference` of `@genoacms/contracts/database`. Core reads `name`,
`schema` and the optional `uiSchema`:

```ts
interface CollectionDefinition {
  name: string
  primaryKey: { key: string, schema: JsonSchema }
  schema: JsonSchema
  uiSchema?: Record<string, { showPreview?: boolean }>
}
```

The fields of a collection are the keys of `schema.properties`, in their declared order. A schema
without `properties` has no fields.

- Test: `packages/core/src/lib/script/database/fields.test.ts`, `packages/core/src/routes/(admin)/collections/[collectionName]/utils.test.ts`
- Level: unit

#### COL-5 · Schema helpers for references and files

`@genoacms/contracts/schemas` exports the schemas the editor recognizes for files and references:

```js
const storageResource = {
  type: 'object',
  title: 'storageResource',
  properties: { bucket: { type: 'string' }, name: { type: 'string' } }
}
const nullableStorageResource = {
  title: 'storageResource',
  oneOf: [storageResource, { type: 'null' }]
}
function reference ({ type = 'string', format, collection }) {
  // the referenced document's id, of `type`; the target collection is the description
  return { type, title: 'reference', description: collection, ...(format ? { format } : {}) }
}
```

A field `{ type: 'array', items: <one of these> }` holds several.

- Test: `packages/contracts/src/schemas.test.js`
- Level: unit

#### COL-6 · The database of a collection

A configured collection is read and written through the provider of the first database, in key
order, that declares it. A dynamic collection is read and written through the provider of the
database whose directory it was listed from. Any other name fails the operation with the host
error `database/not-found`, and no adapter is called.

- Test: `packages/core/src/lib/script/database/database.server.test.ts`, `packages/core/e2e/collections.test.ts`
- Level: unit, e2e

#### COL-7 · A signed dynamic definition

The file of a dynamic collection is a signed envelope of the type
`genoacms.collectionDefinition.v1`, signed by a subordinate key of the key registry, as the
authorization manifests are:

```ts
interface SignedCollectionDefinition {
  alg: string                 // the subordinate key's algorithm
  keyId: string
  type: 'genoacms.collectionDefinition.v1'
  payload: {
    database: string          // the key of the database whose directory holds the file
    definition: CollectionDefinition   // COL-4; its name is the file name
  }
  signature: string           // over alg, keyId, type and payload
}
```

A definition verifies when the envelope's signature verifies against a key that the key registry,
as core last read it, lists and has not revoked (OF27, OF28); the payload has exactly the fields
`database` and `definition`; `payload.database` is the database of the directory the file is in;
and `payload.definition` is a JSON object whose `name` is the file name. Nothing else in the
definition is checked when it is read: whoever signs it checks it against COL-4.

- Test: `packages/core/src/lib/script/database/database.server.test.ts`, `packages/core/e2e/collections.test.ts`
- Level: unit, e2e

### Document service

#### DOC-1 · Permission per operation

Each operation requires a permission on the collection's name, checked before the adapter is called,
and fails with a permission denial without calling it otherwise:

| Operation | Permission |
| :-- | :-- |
| resolving a definition, reading the collection, reading a document | `db:collection:read` |
| creating, updating a document | `db:collection:write` |
| deleting a document | `db:collection:delete` |

A grant on one collection does not satisfy a demand on another, and `write` does not imply `read`.

- Test: `packages/core/src/lib/script/database/user.server.test.ts`
- Level: unit

#### DOC-2 · Reads return only readable fields

A document read, alone or as part of a collection, contains only the fields the principal may read:
every field when a satisfying grant names no fields or the wildcard, otherwise the union of the fields
named by every grant satisfying `db:collection:read` on the collection. A named field the document
does not have is absent.

- Test: `packages/core/src/lib/script/database/user.server.test.ts`
- Level: unit

#### DOC-3 · Updates keep what the writer may not write

An update by a principal whose writable fields are every field stores the submission as given. Any
other update reads the stored document and stores it with only the writable fields taken from the
submission, those the submission has; every other field keeps its stored value. When no document is
stored, only the writable fields of the submission are stored.

- Test: `packages/core/src/lib/script/database/user.server.test.ts`
- Level: unit

#### DOC-4 · Creation drops what the writer may not write

A created document contains only the fields of the submission the principal may write, or the whole
submission when every field is writable. An unwritable field is dropped, not refused.

- Test: `packages/core/src/lib/script/database/user.server.test.ts`
- Level: unit

#### DOC-5 · Creating and updating from the editor

The editor creates a document with the remote command `createDoc({ collectionName, documentData })`
and updates one with `updateDoc({ collectionName, documentId, documentData })`. Each validates
`documentData` against the collection's schema with `@exodus/schemasafe`, which applies formats to
strings only, with these formats: `reference`, `markdown` and `text` accept any string, and
`storageResource` refuses every string. Each returns:

| Case | Result |
| :-- | :-- |
| a missing argument | `{ status: 'fail', text: 'Invalid data format' }` |
| invalid data | `{ status: 'fail', text: 'Invalid document data', errors: undefined }` |
| created | `{ status: 'success', text: 'Document created', id }`, the new document's id |
| updated | `{ status: 'success', text: 'Document updated' }` |
| a permission denial | thrown, not returned |
| any other failure | `{ status: 'fail', text: 'Error creating document' }`, or `'Error updating document'` |

- Test: `packages/core/src/routes/(admin)/collections/[collectionName]/documents.remote.test.ts`, `packages/core/e2e/collections.test.ts`
- Level: unit, e2e

#### DOC-6 · Deleting one document

The document page's form action `delete` deletes the document of the route, requiring `read` on the
collection and `delete`, and answers with a 307 redirect to the collection's listing.

- Test: `packages/core/e2e/collections.test.ts`
- Level: e2e

#### DOC-7 · Deleting several documents

The listing's form action `delete` reads the form field `documents`, a JSON array of ids, strings or
numbers. Each id, as a string, is deleted from the collection of the route, with the check of DOC-6
for each. A missing field fails with status 400 and `{ reason: 'missing-documents' }`. The action does
not redirect.

- Test: `packages/core/src/routes/(admin)/collections/[collectionName]/page.server.test.ts`, `packages/core/e2e/collections.test.ts`
- Level: unit, e2e

### Listing

#### LST-1 · The listing

`/collections/<name>` shows the heading `Collection: <name>`, the count `<n> documents` (`1
document`), a header row of field names and one row per document of the collection, read without
query parameters. A field whose `uiSchema[<field>].showPreview` is `false` has no column. The lead
field, the first field with a column of kind `string`, `text` or `markdown` (EDT-4), has the first
column, and the other fields follow in the schema's order. A collection with no column shows a
column `id` of each document's id instead. Every row is one line high: a cell shows what LST-8
says, cut short with an ellipsis when it does not fit. The header and the rows share one grid, so
each field name stands over its column; a column of kind `boolean`, `number`, `list`,
`references` or `files` is narrow, at most `8rem`, and the listing scrolls sideways when the columns do not fit.
Each row links to `/collections/<name>/<id>`.

- Test: `packages/core/src/routes/(admin)/collections/[collectionName]/listing.test.ts`, `packages/core/e2e/collections.test.ts`
- Level: unit, e2e

#### LST-2 · The toolbar

From left to right: Confirm selection (LST-5), Delete, Select all or Unselect all, New document.
Delete is shown only while the selection is not empty and only to a principal with `delete` on the
collection; New document only to one with `write`. Each is an icon button named by its label.

- Test: `packages/core/e2e/collections.test.ts`
- Level: e2e

#### LST-3 · Selecting documents

Each row has a checkbox named `Select <id>`, which toggles the document's id in the selection. A
selection with a cap (LST-5) hides the checkboxes of unselected rows when full; a selected row can
always be deselected. Select all adds the id of every row shown (LST-7), and is shown while the
selection is empty; Unselect all clears it otherwise.

- Test: `packages/core/e2e/collections.test.ts`
- Level: e2e

#### LST-4 · Deleting the selection

Delete asks `Do you want to delete one document?`, or `Do you want to delete <n> documents?`, then
submits the selection to DOC-7 while showing `Deleting`. On success it clears the selection, reports
`Deleted` and reloads the listing; otherwise it reports `Deletion failed`.

- Test: `packages/core/e2e/collections.test.ts`
- Level: e2e

#### LST-5 · The listing as a picker

Opened with `?selectionId=<id>`, the listing joins the picker protocol of PCK-2: it receives
`maxItems` as the selection's cap (`0` for none) and preselects the opener's current value. While the
selection is not empty, Confirm selection sends it and closes the tab.

- Test: `packages/core/e2e/collections.test.ts`
- Level: e2e

#### LST-6 · Creating a document

New document opens the dialog `New document` with the editor (EDT-4) for an empty document and a
`Create` button, which reads `Creating...` and is disabled while creating. On success the dialog
closes, the result's text is reported, and the page moves to the new document. On a failed result its
text is reported, or `Failed to create document`; when the request itself fails, the error's message,
or `An error occurred`.

- Test: `packages/core/e2e/collections.test.ts`
- Level: e2e

#### LST-7 · Filtering the listing

A field labelled `Filter documents` above the listing shows only the rows in which the document's
id, or the title of one of its cells that is not empty (LST-8), contains the field's text, trimmed,
ignoring case and diacritics: both are compared decomposed, without combining marks, and upper-cased.
While the field holds more than spaces, the count reads `<shown> of <n> documents` (`of 1 document`).
Filtering reads nothing from the server and leaves the selection as it is. Opening another
collection empties the field.

- Test: `packages/core/src/routes/(admin)/collections/[collectionName]/listing.test.ts`, `packages/core/e2e/collections.test.ts`
- Level: unit, e2e

#### LST-8 · What a cell shows

A cell shows its field's value by the field's kind (EDT-4):

| Kind | The cell shows |
| :-- | :-- |
| `string`, `text`, `enum`, `const` | the value as text |
| `uuid`, `reference` | the value as text, in a monospace font |
| `markdown` | the text the markdown reads as, without its syntax and with its entities decoded; its blocks, list items, table cells and line breaks separated by a space |
| `number` | the number, aligned to the end |
| `boolean` | a check mark for `true`, a muted `–` for `false` |
| `list`, `references`, `files` | the number of items, aligned to the end |
| `file` | the part of the file's `name` after its last `/` |
| `object` | `<field>: <value>` for each of its own fields that holds a string of more than spaces, a number or a boolean, in the value's order, joined by ` · ` |
| `unsupported` | a string, a number or a boolean as text |

A value that is absent, `null`, a string of nothing but spaces, of another shape than its kind
expects, or an object with nothing to show, shows a muted `—`. A cell's title is the text it shows; a count's is
`<n> item` or `<n> items`, a boolean's `true` or `false`, and an empty cell's `empty`.

- Test: `packages/core/src/routes/(admin)/collections/[collectionName]/listing.test.ts`, `packages/core/e2e/collections.test.ts`
- Level: unit, e2e

### Document page and editor

#### EDT-1 · The document page

`/collections/<name>/<id>` has the heading `<name> / <id>`, where the name links to the listing. Its
toolbar holds Delete, for a principal with `delete`, and the save state with Save, for one with
`write`. Delete asks `This document will be deleted permanently.`, then submits DOC-6 and reports
`Document deleted`, or `Document deletion failed`. Opening the page records a `collections` activity
with the collection, the document id and the time.

- Test: `packages/core/e2e/collections.test.ts`
- Level: e2e

#### EDT-2 · Saving

Save, and Ctrl+S or ⌘+S anywhere on the page, submits the editor's document to `updateDoc` (DOC-5).
While it runs, Save reads `Saving…` and is disabled. On success the result's text is reported; on
a failed result its text, or `Failed to update document`; when the request itself fails, the error's
message, or `An error occurred`. The page shows `Unsaved changes` while the
editor's document differs from the saved one, compared as JSON, and `Saved` otherwise, and Save is
emphasized while there are unsaved changes. The saved document is the editor's document once its
fields have mounted (EDT-5), and again after each successful save.

- Test: `packages/core/e2e/collections.test.ts`
- Level: e2e

#### EDT-3 · Leaving with unsaved changes

While there are unsaved changes, navigating within the CMS asks
`You have unsaved changes. Leave this page and discard them?` and stays when declined, and leaving
the page (closing, reloading, an external link) triggers the browser's `beforeunload` prompt. After
the document is deleted, nothing is asked.

- Test: `packages/core/e2e/collections.test.ts`
- Level: e2e

#### EDT-4 · The control for each field

Each field of the schema gets the control of the first matching row:

| # | Schema | Kind | Control |
| :-- | :-- | :-- | :-- |
| 1 | `title: 'reference'` | reference | one document of `description` (PCK) |
| 2 | `type: 'string'`, `format: 'uuid'` | uuid | text input and a `Generate UUID` button, which sets a random UUID |
| 3 | `type: 'string'`, `format: 'text'` | text | multi-line text area |
| 4 | `type: 'string'`, `format: 'markdown'` | markdown | code editor with a rendered preview |
| 5 | `enum` is an array | enum | searchable choice of the options (EDT-8) |
| 6 | `type: 'string'` | string | text input |
| 7 | `type: 'number'` | number | number input (EDT-7) |
| 8 | `type: 'boolean'` | boolean | checkbox |
| 9 | `type: 'array'`, `items.title: 'reference'` | references | documents of `items.description` (PCK) |
| 10 | `type: 'array'`, `items.title: 'storageResource'` | files | storage objects (PCK) |
| 11 | `title: 'storageResource'` | file | one storage object (PCK) |
| 12 | `type: 'array'` | list | items of `items` (EDT-11) |
| 13 | `type: 'object'` | object | its fields (EDT-12) |
| 14 | `const` is set | const | none: the value is set to the constant |
| — | anything else | unsupported | none, and the value is left as it is |

- Test: `packages/core/src/routes/(admin)/collections/[collectionName]/Editor/Editor.browser.test.ts`, `packages/core/e2e/collections.test.ts`
- Level: unit, e2e

#### EDT-5 · Defaults on mount

When a control mounts with no value, it sets: `''` for string, text and markdown, `0` for number,
`false` for boolean, the schema's `default` for an enum that has one, and the constant for const.
An object field, and an object item of a list, takes as its value an object of what its own fields set,
as soon as one of them sets something. Other kinds set nothing.

- Test: `packages/core/src/routes/(admin)/collections/[collectionName]/Editor/Editor.browser.test.ts`
- Level: unit

#### EDT-6 · Labels and hints

Every field but const and unsupported is labelled with its name. A field with a single input (uuid,
text, string, number, boolean) is that input's label; any other is a group named by it. Beside the
label, a hint, whose noun is plural unless the number before it is 1:

| Kind | Hint |
| :-- | :-- |
| reference | `→ <collection>` |
| references | `<n> document(s) · <collection>`, or `<n> of <max> document(s) · <collection>` with `maxItems` |
| files | `<n> file(s)`, or `<n> of <max> file(s)` |
| file | `file` |
| list | `<n> item(s)`, or `<n> of <max> item(s)` |
| uuid, text, markdown, enum, number | `UUID`, `long text`, `markdown`, `choice`, `number` |
| string, boolean, object | none |

A nested object's fields are framed together under its label.

- Test: `packages/core/e2e/collections.test.ts`
- Level: e2e

#### EDT-7 · Numbers

A number field stores `Number` of its input on every input; an empty input stores `0`. Any decimal is
accepted.

- Test: `packages/core/src/routes/(admin)/collections/[collectionName]/Editor/Editor.browser.test.ts`
- Level: unit

#### EDT-8 · Choices

An enum field offers `String(option)` for each option, and stores the chosen option itself, of its
original type: `2` for the option `2`, `false` for the option `false`.

- Test: `packages/core/src/routes/(admin)/collections/[collectionName]/Editor/Editor.browser.test.ts`
- Level: unit

#### EDT-9 · The editor's document

The editor starts from the stored document and replaces one field at a time; fields the schema does
not declare keep their stored values. Every change is reported as the whole document.

- Test: `packages/core/src/routes/(admin)/collections/[collectionName]/Editor/Editor.browser.test.ts`
- Level: unit

#### EDT-10 · Markdown

A markdown field edits its source in a code editor and shows it rendered beside it, or below it
when the editor is narrower than 42rem, as soon as the page is interactive.

- Test: `packages/core/e2e/collections.test.ts`
- Level: e2e

#### EDT-11 · Lists

A list shows its items in order, each with a drag handle named `Drag item <n> to reorder`, operable
by pointer and keyboard, and a remove button named `Remove item <n>`. Removing asks
`Remove item #<n>?`. `Add item` appends an empty item, which then takes its default (EDT-5), and is
disabled when the list holds `maxItems`. An empty list says `No items yet.`

An item whose schema is an object is a collapsible card, open when shown, whose header shows `#<n>`,
the value of its discriminator when the schema has one, and the first field of the item, other than
the discriminator, whose value is a non-empty string, or `Untitled`. Any other item is its control in
a row.

- Test: `packages/core/e2e/collections.test.ts`
- Level: e2e

#### EDT-12 · Objects and variants

An object field shows the fields of its schema (EDT-4). A schema with `discriminator.propertyName` and
`oneOf` shows the fields of one variant, chosen with a control listing each variant by the `const` of
its discriminator property, or by its index when it has none. The variant shown is the one whose
constant equals the value's discriminator, or the first. Choosing a variant removes from the value
every field the new variant does not declare and sets the discriminator to its constant.

- Test: `packages/core/src/routes/(admin)/collections/[collectionName]/Editor/Editor.browser.test.ts`, `packages/core/e2e/collections.test.ts`
- Level: unit, e2e

### Pickers

#### PCK-1 · Opening a picker

A reference, references, file or files field opens its picker in a new tab: `/storage?selectionId=<id>`
for files, `/collections/<collection>?selectionId=<id>` for references, where `<id>` is a random UUID
of that field, fixed while the field is mounted.

- Test: `packages/core/e2e/collections.test.ts`
- Level: e2e

#### PCK-2 · The picker protocol

The two tabs exchange messages `{ eventName, data }` on the `BroadcastChannel` named by the
`selectionId`:

```pseudo
picker  → selectionInit
opener  → selectionInitData { parameters: { maxItems }, defaultValue: current value as an array }
picker  → selectionDone     chosen items, when the user confirms
opener  → selectionKill
picker closes its tab
```

`maxItems` is `1` for a reference and a file, `0` (no limit) for references, and the schema's
`maxItems`, or `0`, for files. The opener closes its channel when the field unmounts.

- Test: `packages/core/e2e/collections.test.ts`
- Level: e2e

#### PCK-3 · Applying a selection

A non-empty `selectionDone` replaces the field's value: with its first item for a reference or a file,
with the whole array otherwise. An empty one changes nothing.

- Test: `packages/core/src/routes/(admin)/collections/[collectionName]/Editor/pickers.browser.test.ts`
- Level: unit

#### PCK-4 · Picked values

Each picked value is shown with a remove button named `Remove <title>`: a file by its name, with its
bucket and an icon of its type; a document by its id, with its collection and a link named
`Open <id>` to its page in a new tab. The picker button reads:

| Field | Empty | Not empty |
| :-- | :-- | :-- |
| files | `Choose files from storage` | `Edit selection`, and `Clear all` beside it |
| file | `Choose a file from storage` | none |
| references | `Choose from <collection>` | `Edit selection` |
| reference | `Choose from <collection>` | none |

- Test: `packages/core/e2e/collections.test.ts`
- Level: e2e
