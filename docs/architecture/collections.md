---
type: architecture
title: Collections
prefix: O
codes: [COL, DOC, LST, EDT, PCK]
verified: 2fc5670
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
genoa.config  ──collections──▶ host.collections ─┐
default bucket .genoacms/collections/<name> ─────┴─▶ catalog (COL)
                                                        │
route  ──AuthContext──▶ document service (DOC) ──▶ host.databaseForCollection ──▶ adapter
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
answers the file pickers of PCK, has no document yet either.

### Decisions

| # | Decision | Where |
| :-- | :-- | :-- |
| OU1 | 2026-10-10: collections get an architecture document of their own, written from the code as it is after the editor redesign (`d6bf7aa`, `2fc5670`). | this document |
| OU2 | 2026-10-10: the document editor is redesigned: labelled fields with a type hint, compact fields sharing a row, list items as collapsible cards, labelled pickers, a save state on the document page, and a warning before leaving unsaved changes. | OD7 to OD10; EDT-1 to EDT-12, PCK-4 |

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

### Findings

All found on 2026-10-10 by reading the code at `2fc5670`; none was reproduced.

| # | Finding | State |
| :-- | :-- | :-- |
| OF1 | **The document selection outlives the collection it was made in.** It is one module-level instance (`database/SelectionRune.svelte.ts`) shared by every listing and never cleared on navigation. Selecting documents in one collection and opening another keeps them selected: the second listing shows Delete, and confirming it posts the first collection's ids to the second collection's delete action (DOC-7), which deletes any documents there with the same ids. | open |
| OF2 | **A principal who may write a field but not read it erases it by saving.** The field is projected away on read (DOC-2), the editor fills the missing value with its default (EDT-5), and the update writes that default over the stored value, because the field is writable (DOC-3). | open |
| OF3 | **The editor writes defaults into every document it opens (EDT-5).** A field missing from a stored document gets `''`, `0` or `false` as soon as the editor mounts, and the next save stores it. A document saved once can no longer be told apart from one whose author entered those values. | open |
| OF4 | **Some schemas render no control.** `type: 'integer'`, a type list such as `['string', 'null']`, and any schema matching no kind of EDT-4 render nothing, not even their label, and their value is kept unchanged. | open |
| OF5 | **`primaryKey` is declared but not used by core.** Documents are addressed by the id the adapter assigns (DOC-6). A property named like `primaryKey.key` is an ordinary editable field, although the end-to-end helper `tests/support/collections.ts` says the primary key is not editable. | open |
| OF6 | **`uiSchema` is read but not declared.** The listing hides columns marked `uiSchema[<field>].showPreview === false` (LST-1), but `CollectionReference` has no `uiSchema`, so the option is invisible to a config author's types and is a type error in core. | open |
| OF7 | **A reference field keeps its target collection in the JSON Schema `description`** (COL-5). An author who documents the field with a description changes what it references. | open |
| OF8 | **The listing reads the whole collection.** No query parameters reach the adapter (LST-1). The select-all control's comment says the listing is paginated; it is not. | open |
| OF9 | **Dynamic collections are listed once, at process start (COL-1).** A definition added to `.genoacms/collections/` while the CMS runs can be opened by its URL, because a definition is resolved on demand (COL-2), but is missing from the catalog until a restart. A dynamic definition with the name of a configured collection replaces it on resolution, while the catalog lists the name twice. | open |
| OF10 | **A failed validation tells the user nothing about the field.** The service returns schemasafe's errors (DOC-5); the page shows only "Invalid document data" and logs the errors to the console. | open |
| OF11 | **Clearing a number field stores `0` (EDT-7).** An empty input is read as `Number('')`. | open |
| OF12 | **The collections page title is not a heading.** It is written as an `<hi>` element, so it has no heading role. | open |
| OF13 | **The save shortcut ignores the write permission.** Ctrl+S or ⌘+S submits an update (EDT-2) on a page whose Save button is hidden from the principal; the service refuses it (DOC-1), and the page reports the refusal as a failed save. | open |

### History

*History.* Until 2026-10-10 (`d6bf7aa`, `2fc5670`) the editor stacked every field at full width under
a `name:` label, rendered every object, nested or not, with a drag handle and a Delete menu, showed
pickers as icon-only buttons with a bare `n / ∞` counter, and the document page was titled
"Update <id> of <collection>" with an icon-only save. Dragging a list item started only when the
press landed on the grip glyph: svelte-dnd-action ignores a press whose target has a `value`, which
a `<button>` handle does.

### Verification

No statement is verified by a test that carries its ID yet. Existing tests that check some of them
without carrying IDs:

- `packages/core/src/lib/script/database/user.server.test.ts` (unit): the permission per operation
  and the catalog filter (DOC-1, COL-3).
- `packages/core/src/lib/script/authorization/fields.test.ts` (unit): the field rules behind DOC-2 to
  DOC-4, on the pure functions rather than through the service.
- `packages/core/src/lib/script/database/collections.test.ts` (unit): schemasafe with core's formats
  against the example collections (DOC-5).
- `packages/core/tests/collections.spec.ts`, `tests/selection.spec.ts` (Playwright): creating,
  reopening, saving, deleting and bulk-deleting documents. They need GCP credentials, do not run in
  CI, and are not a level of `docs/README.md`.

The editor redesign was checked on 2026-10-10 in a throwaway Vite page rendering the editor with a
mock schema: rendering of every kind, collapsing, adding and removing items, reordering by
step-wise mouse events, the item summary, the save state, and a phone-width layout.

## Specification

### Catalog

#### COL-1 · Where collections come from

The catalog is the configured collections, in configuration order across every database
(`host.collections`), followed by one collection per file in the directory `.genoacms/collections`
of the default bucket, named by the file name. The directory is listed once, when the server process
starts, and created when missing. Nothing is listed or created while SvelteKit analyses the build.

- Test: unverified
- Level: integration

#### COL-2 · Resolving a definition

A collection name resolves to the JSON object stored at `.genoacms/collections/<name>` in the default
bucket. When that object cannot be read, it resolves to the first configured collection of that name.
When there is none, resolution fails with the error `collection/not-found`.

- Test: unverified
- Level: integration

#### COL-3 · The catalog a principal sees

`/collections` lists, as links to `/collections/<name>`, the names of the catalog on which the
principal holds any grant whose resource is that collection, whatever its permission.

- Test: unverified
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

- Test: unverified
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

- Test: unverified
- Level: unit

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

- Test: unverified
- Level: unit

#### DOC-2 · Reads return only readable fields

A document read, alone or as part of a collection, contains only the fields the principal may read:
every field when a satisfying grant names no fields or the wildcard, otherwise the union of the fields
named by every grant satisfying `db:collection:read` on the collection. A named field the document
does not have is absent.

- Test: unverified
- Level: unit

#### DOC-3 · Updates keep what the writer may not write

An update by a principal whose writable fields are every field stores the submission as given. Any
other update reads the stored document and stores it with only the writable fields taken from the
submission, those the submission has; every other field keeps its stored value. When no document is
stored, only the writable fields of the submission are stored.

- Test: unverified
- Level: unit

#### DOC-4 · Creation drops what the writer may not write

A created document contains only the fields of the submission the principal may write, or the whole
submission when every field is writable. An unwritable field is dropped, not refused.

- Test: unverified
- Level: unit

#### DOC-5 · Creating and updating from the editor

The editor creates a document with the remote command `createDoc({ collectionName, documentData })`
and updates one with `updateDoc({ collectionName, documentId, documentData })`. Each validates
`documentData` against the collection's schema with `@exodus/schemasafe`, with these formats:
`reference`, `markdown` and `text` accept any value, and `storageResource` accepts an object whose
`bucket` and `name` are truthy. Each returns:

| Case | Result |
| :-- | :-- |
| a missing argument | `{ status: 'fail', text: 'Invalid data format' }` |
| invalid data | `{ status: 'fail', text: 'Invalid document data', errors }`, schemasafe's errors |
| created | `{ status: 'success', text: 'Document created', id }`, the new document's id |
| updated | `{ status: 'success', text: 'Document updated' }` |
| a permission denial | thrown, not returned |
| any other failure | `{ status: 'fail', text: 'Error creating document' }`, or `'Error updating document'` |

- Test: unverified
- Level: unit, e2e

#### DOC-6 · Deleting one document

The document page's form action `delete` deletes the document of the route, requiring `read` on the
collection and `delete`, and answers with a 307 redirect to the collection's listing.

- Test: unverified
- Level: e2e

#### DOC-7 · Deleting several documents

The listing's form action `delete` reads the form field `documents`, a JSON array of ids, strings or
numbers. Each id, as a string, is deleted from the collection of the route, with the check of DOC-6
for each. A missing field fails with status 400 and `{ reason: 'missing-documents' }`. The action does
not redirect.

- Test: unverified
- Level: unit, e2e

### Listing

#### LST-1 · The listing

`/collections/<name>` shows the heading `Collection: <name>`, a header row of field names and one row
per document of the collection, read without query parameters. A field whose
`uiSchema[<field>].showPreview` is `false` has no column. A cell shows `<n> items` for an array field
and the value otherwise, or nothing when absent. Each row links to `/collections/<name>/<id>`.

- Test: unverified
- Level: e2e

#### LST-2 · The toolbar

From left to right: Confirm selection (LST-5), Delete, Select all or Unselect all, New document.
Delete is shown only while the selection is not empty and only to a principal with `delete` on the
collection; New document only to one with `write`. Each is an icon button named by its label.

- Test: unverified
- Level: e2e

#### LST-3 · Selecting documents

Each row has a checkbox named `Select <id>`, which toggles the document's id in the selection. A
selection with a cap (LST-5) hides the checkboxes of unselected rows when full; a selected row can
always be deselected. Select all adds every listed id, and is shown while the selection is empty;
Unselect all clears it otherwise.

- Test: unverified
- Level: e2e

#### LST-4 · Deleting the selection

Delete asks `Do you want to delete one document?`, or `Do you want to delete <n> documents?`, then
submits the selection to DOC-7 while showing `Deleting`. On success it clears the selection, reports
`Deleted` and reloads the listing; otherwise it reports `Deletion failed`.

- Test: unverified
- Level: e2e

#### LST-5 · The listing as a picker

Opened with `?selectionId=<id>`, the listing joins the picker protocol of PCK-2: it receives
`maxItems` as the selection's cap (`0` for none) and preselects the opener's current value. While the
selection is not empty, Confirm selection sends it and closes the tab.

- Test: unverified
- Level: e2e

#### LST-6 · Creating a document

New document opens the dialog `New document` with the editor (EDT-4) for an empty document and a
`Create` button, which reads `Creating...` and is disabled while creating. On success the dialog
closes, the result's text is reported, and the page moves to the new document. On failure the result's
text is reported, or `Failed to create document`.

- Test: unverified
- Level: e2e

### Document page and editor

#### EDT-1 · The document page

`/collections/<name>/<id>` has the heading `<name> / <id>`, where the name links to the listing. Its
toolbar holds Delete, for a principal with `delete`, and the save state with Save, for one with
`write`. Delete asks `This document will be deleted permanently.`, then submits DOC-6 and reports
`Document deleted`, or `Document deletion failed`. Opening the page records a `collections` activity
with the collection, the document id and the time.

- Test: unverified
- Level: e2e

#### EDT-2 · Saving

Save, and Ctrl+S or ⌘+S anywhere on the page, submits the editor's document to `updateDoc` (DOC-5).
While it runs, Save reads `Saving…` and is disabled. On success the result's text is reported; on
failure the result's text, or `Failed to update document`. The page shows `Unsaved changes` while the
editor's document differs from the saved one, compared as JSON, and `Saved` otherwise, and Save is
emphasized while there are unsaved changes. The saved document is the editor's document once its
fields have mounted (EDT-5), and again after each successful save.

- Test: unverified
- Level: e2e

#### EDT-3 · Leaving with unsaved changes

While there are unsaved changes, navigating within the CMS asks
`You have unsaved changes. Leave this page and discard them?` and stays when declined, and leaving
the page (closing, reloading, an external link) triggers the browser's `beforeunload` prompt. After
the document is deleted, nothing is asked.

- Test: unverified
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

- Test: unverified
- Level: unit, e2e

#### EDT-5 · Defaults on mount

When a control mounts with no value, it sets: `''` for string and text, `0` for number, `false` for
boolean, the schema's `default` for an enum that has one, and the constant for const. Other kinds set
nothing.

- Test: unverified
- Level: unit

#### EDT-6 · Labels and hints

Every field but const and unsupported is labelled with its name. A field with a single input (uuid,
text, string, number, boolean) is that input's label; any other is a group named by it. Beside the
label, a hint:

| Kind | Hint |
| :-- | :-- |
| reference | `→ <collection>` |
| references | `<n> document(s) · <collection>`, or `<n> of <max> documents · <collection>` with `maxItems` |
| files | `<n> file(s)`, or `<n> of <max> files` |
| file | `file` |
| list | `<n> item(s)`, or `<n> of <max> items` |
| uuid, text, markdown, enum, number | `UUID`, `long text`, `markdown`, `choice`, `number` |
| string, boolean, object | none |

A nested object's fields are framed together under its label.

- Test: unverified
- Level: e2e

#### EDT-7 · Numbers

A number field stores `Number` of its input on every input; an empty input stores `0`. Any decimal is
accepted.

- Test: unverified
- Level: unit

#### EDT-8 · Choices

An enum field offers `String(option)` for each option, and stores the option of the original type
whose string was chosen; a string matching no option is stored as a number for a numeric schema, as
`raw === 'true'` for a boolean one, and as the string otherwise. Clearing the choice stores
`undefined`, unless `''` is an option.

- Test: unverified
- Level: unit

#### EDT-9 · The editor's document

The editor starts from the stored document and replaces one field at a time; fields the schema does
not declare keep their stored values. Every change is reported as the whole document.

- Test: unverified
- Level: unit

#### EDT-10 · Markdown

A markdown field edits its source in a code editor and shows it rendered beside it, or below it when
the editor is narrower than 42rem.

- Test: unverified
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

- Test: unverified
- Level: e2e

#### EDT-12 · Objects and variants

An object field shows the fields of its schema (EDT-4). A schema with `discriminator.propertyName` and
`oneOf` shows the fields of one variant, chosen with a control listing each variant by the `const` of
its discriminator property, or by its index when it has none. The variant shown is the one whose
constant equals the value's discriminator, or the first. Choosing a variant removes from the value
every field the new variant does not declare and sets the discriminator to its constant.

- Test: unverified
- Level: unit, e2e

### Pickers

#### PCK-1 · Opening a picker

A reference, references, file or files field opens its picker in a new tab: `/storage?selectionId=<id>`
for files, `/collections/<collection>?selectionId=<id>` for references, where `<id>` is a random UUID
of that field, fixed while the field is mounted.

- Test: unverified
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

- Test: unverified
- Level: e2e

#### PCK-3 · Applying a selection

A non-empty `selectionDone` replaces the field's value: with its first item for a reference or a file,
with the whole array otherwise. An empty one changes nothing.

- Test: unverified
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

- Test: unverified
- Level: e2e
