---
type: architecture
title: Components and pages
prefix: N
codes: [CMP, SRC, HIS, PUB, PGE, TRE]
verified: 7f69446f
---

# Components and pages

## Design

### Role

Components and pages are GenoaCMS's composed content. A **component** is a named, typed description
of the values it accepts, its **attributes**. A **prebuilt** component's code lives in the consuming
application. A **dynamic** component's code is written in the CMS, as the body of a function, and
compiled by a language adapter. A **page** is a tree of component nodes, each holding a value for
every attribute of its component. Publishing a component signs its description, and its compiled
code when it has some. Building a page signs a tree that pins, for every node, the publication of
its component current at that moment. A consumer, through `@genoacms/sdk`, verifies both and renders.

This document covers what core does with them: the catalog of component headers, the source of a
dynamic component, the editing history, publication, page entries and their editing, and the
published page tree.

```
registrar ──CMP──▶ .genoacms/components/headers/<uid>.json (+ .history)
editor ────SRC──▶ .genoacms/components/dynamic/<uid>/data.json (+ history.json)
                          │ header + body ── language adapter: analyze, compile (PUB-3)
publish ───PUB──▶ .genoacms/components/public/<uid>/<publicationId>.json   signed, written once
                  .genoacms/components/publications/<uid>.json            pointer, rewritten
pages ─────PGE──▶ .genoacms/pages/entries/<name>                         draft tree, with history
build ─────TRE──▶ .genoacms/pages/readables/<name>                       signed tree, pins publications
                                         ▲
consumer (@genoacms/sdk) reads the two signed documents, verifies, renders
```

Every path is in the default bucket. Out of scope, and specified elsewhere or not yet at all: the
attribute vocabulary's types, which `@genoacms/internal/attributes` declares and this document
quotes; the language adapter contract and the static analysis ruleset (`@genoacms/internal`,
RFC-0011); the security policy that supplies the guard ceilings and the allowed origins; signing
keys, the key registry and the envelope (no document yet; [`collections.md`](collections.md) COL-7
uses the same envelope); the grant model behind the permissions named here (no document yet); the
consumer SDK's verification and rendering (no document yet); the storage browser that answers file
pickers ([`storage.md`](storage.md)).

### Decisions

| # | Decision | Where |
| :-- | :-- | :-- |
| NU1 | 2026-10-27: components and pages get an architecture document of their own, written from the code as it is at `8161e000`, so that agent access to them can be specified against it. | this document |
| NU2 | 2026-10-27: saving a header saves only a component that exists, and keeps its stored kind (NF1, NF2). | CMP-8 |
| NU3 | 2026-10-27: a page name is one level, checked when the page is created, and creating a page never replaces one (NF4). | PGE-2, PGE-11 |
| NU4 | 2026-10-27: a page's nodes are of stored, published components: the root when a page is created, and a child, which the slot must also accept and have room for (NF5, NF8). | PGE-2, PGE-5 |
| NU5 | 2026-10-27: editing a node takes only its values from the client, each checked against its attribute; changing a slot is a structure edit, may only reorder or remove the node's own children, and a removed child leaves the page with every node below it (NF6, NF7). | PGE-4 |
| NU6 | 2026-10-27: every save carries the version it was read at, and a save of an object changed since is refused, on the screens and through agent tools alike (NF11). | HIS-2 |

**ND1. One catalog holds both kinds, and the kind decides what is stored (CMP-2, CMP-6).** Every
component has a header in one directory. A dynamic one also has a source definition. Creating,
deleting and publishing read the stored kind and never one the caller supplies.
*Why:* a component's description is the same thing for both kinds, and a page composes from both.
Dispatching on a kind the request names would let a client delete a dynamic component through the
header path and leave its source and signed publications behind.
*Cost:* every write reads the stored header first.

**ND2. An attribute is a meta-schema, and an unset constraint is an absent key (CMP-3).** An
attribute carries a JSON Schema of its value and nothing beside it. An unset constraint is omitted,
never `null`, `undefined` or empty.
*Why:* headers are signed over their RFC 8785 canonical form, where `{"minimum":null}` and `{}`
are different bytes. Two producers spelling "unset" two ways would sign one component two ways.
*Cost:* every producer has to omit, and a two-way binding in the editor cannot express omission.

**ND3. Permissions follow the intent of an operation, and are instance-scoped (CMP-11, PGE-10).**
Components: `read` sees the catalog, `register` creates and deletes, `modify` changes a description,
`code` reaches source. Pages: `read`, `content_edit`, `structure_edit`, `publish`, `delete`. No
operation takes a resource.
*Why:* describing a component and writing executable code are different trust levels, and so are
changing a value on a page and changing its shape. Storage offers one upsert, so the intent has to
be named by the operation.
*Cost:* a grant cannot be limited to one component or one page. The content/structure line is
drawn by what an edit changes: a value is content, a slot is structure.

**ND4. A description and its editing history are separate objects, and the description is written
first (CMP-1, HIS-1).** The history is a list of deep-diff steps beside the stored object.
*Why:* the description is what gets published and signed, and must not carry the author's
afternoon. With no transaction across two objects, writing the description first means a failure
loses undo depth, not correctness.
*Cost:* pages still store their history inline in the entry, so their two halves are one object.

**ND5. Each save records the step against what storage holds (HIS-1).** The previous state is read
from storage, not taken from the client.
*Why:* an undo replays the recorded step, and a client reporting its own "before" could make undo
restore a state that never existed.
*Cost:* a read before every write. A save that started from an older state than storage
holds is refused (HIS-2).

**ND6. A dynamic component has one draft and no commits (SRC-1).** `body` is rewritten on every
save; `publishedBody` is what the last publication compiled. Publishing builds from the draft.
*Why:* publication is the only act that produces anything; a second gate in front of it had no
state of its own to record. Undo covers what commits were used for.
*Cost:* there is no stored revision between publications except the undo history.

**ND7. A release is one signed document, written once (PUB-4, PUB-5).** It carries the description
and, for a dynamic component, the compiled bundles, each with its platform and guard ceilings. A
mutable pointer names the latest. Everything that can refuse runs before anything is written, and
the document is written before the pointer.
*Why:* two documents signed separately had to be checked against each other by every consumer. A
document consumers cache by path must never change under that path. A pointer to a missing document
is worse than a document nothing points to.
*Cost:* a consumer downloads bundles for platforms it cannot run. A failure between the two writes
leaves an unreferenced document behind.

**ND8. No change, no publication (PUB-2).** A publication needs the description's digest, the body,
or the signature the body is wrapped in to differ from the last publication.
*Why:* a publication is a signed, permanent artifact and a new pin for pages; one that says nothing
new is noise in the audit trail.
*Cost:* the signature is compared by the adapter's emitted text, so an adapter changing its output
makes every dynamic component publishable again.

**ND9. The language adapter assembles and compiles; core never sees assembled source (PUB-3,
SRC-3).** Core passes the body and the shape. The adapter emits the signature, analyzes, compiles
and maps diagnostics back to the body's lines. The security policy is read once per publication,
and the same ceilings and origins are analyzed, compiled in and recorded.
*Why:* the entry function's syntax and the type each attribute becomes are facts about the target
language; a second emitter in core would drift from the one that compiles.
*Cost:* only one adapter exists, so the contract has not met a second language.

**ND10. A page pins a publication for every node, of either kind, and states the kind (TRE-2).**
A node carries the component's `uid`, the `publicationId` current when the page was built, and its
`type`.
*Why:* a page must not change because a component was edited after the page was built. A prebuilt
component publishes its signed description, so it has a publication to pin too, and inferring the
kind from the absence of a pin would let whoever can write the bucket decide it.
*Cost:* a page shows a component's new version only after the page is built again.

**ND11. A page may only introduce published components (PUB-7).** The page editor offers only
components with a publication.
*Why:* a node of a component never published has no pin, and the consumer refuses to render it.
The editor is where the choice is made.
*Cost:* none beyond the check itself: the actions refuse a component without a publication (PGE-2, PGE-5).

**ND12. A component pinned by a published page cannot be deleted (CMP-9, CMP-10).** Deletion
lists the pages whose published tree pins the component and refuses while there is any.
*Why:* a deleted component's publications are removed with it, so a published page pinning it
would fail to render. A warning would need a surface to show it on, and the bulk selection has
none.
*Cost:* only published trees are consulted, not page entries (NF9). Every deletion reads every
published tree.

**ND13. The published tree holds resolved values, keyed by attribute name (TRE-3).** Markdown
becomes sanitized HTML, links and files become URLs, slots become nested nodes, at build time.
*Why:* a consumer renders without reaching back into the CMS or its storage.
*Cost:* a value that depends on another object (a linked page's preview URL, a file's public URL)
is fixed until the page is built again. Attribute names have to be unique in a component (CMP-5).

### Findings

Found on 2026-10-27 by reading the code at `8161e000`, and not reproduced, unless the row says
otherwise.

| # | Finding | State |
| :-- | :-- | :-- |
| NF1 | **`components:modify` can create a component.** Updating a header (CMP-8) does not check that the component exists: a header with a new `uid` is stored as a new component, without `components:register`, and of either kind, so a `dynamic` one without a source definition (SRC-2 then fails on it). | fixed, RFC-0039 |
| NF2 | **A header update can change the stored kind.** CMP-8 stores the submitted `type`, so a prebuilt component becomes dynamic without a definition, or a dynamic one prebuilt while its definition stays in the bucket; undo replays such a step too. ND1 says the kind is fixed at creation. | fixed, RFC-0039 |
| NF3 | **A header is not checked for consistency (CMP-4).** Nothing requires an attribute's key to equal its `uid`, `attributeOrder` to list exactly the keys of `attributes`, or its entries to be distinct. The published order is what a consumer calls the component's parameters by (PUB-4). | open |
| NF4 | **A page name is not validated (PGE-2).** It is joined into a storage path, so a name containing `/` or `..` addresses another object of the default bucket: `../../components/headers/<uid>.json` writes a page entry over a component header. Creating a page with an existing name overwrites that page. | fixed, RFC-0039 |
| NF5 | **Adding a child node trusts the client's component header (PGE-5).** The child is built from the `schema` form field as submitted: its `entryReference` and attributes are the client's, not those of a stored, published component, and the slot's `items.enum` is not checked. A node that does not exist fails with a `TypeError`, answered as 500, because the failure it builds is not returned. | fixed, RFC-0039 |
| NF6 | **The update action can change a page's structure with `pages:content_edit` (PGE-4).** It replaces the node with the one the client sends, unvalidated, so the value of a `components` slot can be rewritten: children removed, reordered, or pointed at other nodes of the page. The client's `name` and `schema` fields are stored in the entry with it. | fixed, RFC-0039 |
| NF7 | **A child removed from a slot stays in the page (PGE-4).** Its node is left in `contents.nodes` with nothing referring to it. | fixed, RFC-0039 |
| NF8 | **Creating a page accepts any component (PGE-2).** The root component is the form's `componentUID`, published or not; only the editor's offer is limited (PUB-7). | fixed, RFC-0039 |
| NF9 | **Deleting a component breaks the drafts that use it, and deleting a page breaks the pages that link to it.** CMP-9 consults only published trees. A page entry with a node of a deleted component can no longer be opened (`No page named "<name>"`, PGE-3), edited or built. A page linking to a deleted page fails to build (TRE-3). | open |
| NF10 | **A `richText` attribute always publishes `''` (TRE-3).** The type is offered and stored, and its value is dropped at build. | open |
| NF11 | **Concurrent saves overwrite each other.** Every save of a header, a body or a page reads, changes and writes without a precondition, so of two editors saving the same object the later wins silently and the earlier's step is lost from the history. | fixed, RFC-0039 |
| NF12 | **A failed read is read as absence.** Reading a header (CMP-7) or a pointer (PUB-5) treats any storage failure as a missing object, so an outage makes a component look absent or unpublished; opening a page (PGE-3) answers any failure as 404. | open |
| NF13 | **No server-side record says who edited what.** The dashboard's activity is the browser's own list of recently opened items. Only a publication names its publisher (PUB-4); a page tree records neither who built it nor when (TRE-1). | open |
| NF14 | **Publishing reports a permission denial as a failed result (PUB-6),** where the document service of [`collections.md`](collections.md) DOC-5 throws it. The form logs every failure to the console. | open |
| NF15 | **A deletion of a prebuilt component that does not exist says it is dynamic (CMP-9).** The refusal is `components/not-prebuilt: <uid> is a dynamic component. …` for a reference that names nothing. | open |
| NF16 | **A dynamic component is always created in `typescript` (SRC-1).** No operation sets or changes `language`. | open |
| NF17 | **`setStorageResourceValue` stores one object where a list belongs (PGE-6).** It sets a `storageResource` value, a list (CMP-3), to the first item of the selection, so building the page then fails on it. No screen calls the action: the file control saves through `update` (PGE-4). | fixed, RFC-0039 |
| NF18 | **Deleting through the registrar reads the component before the permission is checked (CMP-11).** The kind decides which service deletes, so the header is read for a principal who may then be refused. | open |

### History

*History.* Until the component rework of August and September 2026, a component's attributes were
derived from its source by the language adapter and rematched by name on every publication, a
release was two signed documents (a header and an executable), page nodes embedded a dynamic
component's source, and prebuilt nodes were recognised by having no pin. The code's doc comments
record each step; this document starts from the state at `8161e000`.

### Verification

RFC-0039 added tests that carry the IDs of CMP-8, HIS-2, PGE-2, PGE-4, PGE-5 and PGE-11. The other
statements are checked by existing tests that do not carry their IDs, so each says `unverified` and
names them. Adding the IDs to those titles is a change of tests only. HIS-2 and the changed
statements of RFC-0039 are not yet audited for falsification.

- **`unit`, in Node.** Permissions (CMP-11, PGE-10) are tested on the `*User*` services with
  storage stubbed. The history (HIS-1) on the generic operations and on the header, body and page
  entry. Publication (PUB-1 to PUB-5, PUB-7) on `publishComponent` with storage and the key stubbed,
  the real TypeScript adapter, and real ML-DSA-65 signatures. Deletion's dependants (CMP-10) on
  `listPagesPinning` with stored trees.
- **Playwright** (`packages/core/tests/components.spec.ts`, `pages.spec.ts`,
  `pageComposition.spec.ts`, `revisionPinning.spec.ts`) drives the screens. They need the
  development credentials, do not run in CI, and are not a level of `docs/README.md`.

Not covered by any test: the storage layout as a whole (CMP-1) and value resolution in the built tree
(TRE-3).

## Specification

### Storage

#### CMP-1 · What is stored, and where

Every object is in the default bucket. *Flatted* is the serialization of the `flatted` package;
*JSON* is plain JSON.

| Object | Path | Form | Written |
| :-- | :-- | :-- | :-- |
| component header (CMP-2) | `.genoacms/components/headers/<uid>.json` | JSON | on create, save, undo, redo |
| header history (HIS-1) | `.genoacms/components/headers/<uid>.history` | Flatted | after a save that changed it, undo, redo |
| source definition (SRC-1) | `.genoacms/components/dynamic/<uid>/data.json` | Flatted | on create, save, undo, redo, publish |
| source history (HIS-1) | `.genoacms/components/dynamic/<uid>/history.json` | Flatted | after a save, undo, redo |
| publication (PUB-4) | `.genoacms/components/public/<uid>/<publicationId>.json` | JSON, signed | once |
| publication pointer (PUB-5) | `.genoacms/components/publications/<uid>.json` | Flatted | on every publication |
| page entry (PGE-1) | `.genoacms/pages/entries/<name>` | Flatted | on every page edit |
| published page tree (TRE-1) | `.genoacms/pages/readables/<name>` | JSON, signed | on every build |

A file in `headers/` whose name ends in `.history` is not a component. The catalog's references are
the other file names, without `.json`.

- Test: `packages/core/src/lib/script/components/catalog.test.ts`, `packages/core/src/lib/script/components/componentHeader/io.server.test.ts`, `packages/core/src/lib/script/components/layout.test.ts`
- Level: unit

### Catalog

#### CMP-2 · A component header

```ts
type ComponentType = 'prebuilt' | 'dynamic'

interface ComponentHeader {
  uid: string                                 // a random UUID, given at creation
  type: ComponentType
  name: string                                // a label; not unique, not an identifier
  attributes: Record<string, Attribute>       // keyed by the attribute's uid (CMP-3)
  attributeOrder: string[]                    // attribute uids, in the order a consumer passes them
}
```

- Test: `packages/core/src/lib/script/components/catalog.test.ts`, `packages/core/src/lib/script/components/componentHeader/component/attributeInits.test.ts`, `packages/core/src/lib/script/components/layout.test.ts`
- Level: unit

#### CMP-3 · Attributes

An attribute is `{ uid, name, type, schema }`, where `schema` is a meta-schema of its value, of the
`Attribute` union of `@genoacms/internal/attributes`. Its name, as pages and the published tree use
it, is `schema.title`.

| `type` | `schema.type` | Value on a page (PGE-1) | Constraints a schema MAY carry |
| :-- | :-- | :-- | :-- |
| `boolean` | `boolean` | `boolean` | `default` |
| `number` | `number` | `number` | `minimum`, `maximum`, `multipleOf`, `decimalPlaces`, `default` |
| `string`, `text`, `markdown`, `richText` | `string` | `string` | `minLength`, `maxLength`, `pattern`, `format`, `default` |
| `link` | `array` of link objects | `Array<{ isExternal: true, url } \| { isExternal: false, pageName }>` | `minItems`, `maxItems`, `default` |
| `storageResource` | `array` of `{ bucket, name }` | `Array<{ bucket, name }>` | `minItems`, `maxItems`, `default` |
| `components` | `array` of `{ type: 'string', enum? }` | `Array<node uid>`, a slot | `items.enum` (accepted component names; absent or empty accepts any), `minItems`, `maxItems`, `default` |

Every schema has `title`, `description` and `required`. An unset constraint is an absent key: never
`null`, `undefined`, `''` or `[]`.

- Test: `packages/core/src/lib/script/components/componentHeader/component/attributeInits.test.ts`, `packages/core/src/lib/script/components/componentHeader/component/constraints.test.ts`, `packages/core/src/lib/script/components/layout.test.ts` (unverified: the form of a link and storageResource `default`)
- Level: unit

#### CMP-4 · A valid header

A stored header is valid when it matches CMP-2 with no other top-level field and every attribute
matches the meta-schema of its `type`, with no field the meta-schema does not declare. A stored
header that is not valid reads as absent. Nothing else is checked (NF3).

- Test: `packages/core/src/lib/script/components/catalog.test.ts`, `packages/core/src/lib/script/components/componentHeader/component/attributeInits.test.ts`, `packages/core/src/lib/script/components/layout.test.ts`
- Level: unit

#### CMP-5 · Attribute names

Before anything is read or written, saving a header (CMP-8) refuses one where two attributes share
a name, compared as `schema.title` trimmed and case-sensitive, with an error whose message starts
with `components/duplicate-attribute-name:` and quotes each shared name (an empty one as
`an empty name`). It refuses one with an attribute named `passthrough`, which every component
receives as a parameter, with an error whose message starts with `components/reserved-attribute-name:`.

- Test: `packages/core/src/lib/script/components/componentHeader/component/attributeNames.test.ts`, `packages/core/src/lib/script/components/componentHeader/editing.server.test.ts`, `packages/core/src/lib/script/components/layout.test.ts`
- Level: unit

#### CMP-6 · Registering a component

The remote command `createComponent({ name, type })` validates its argument: `name` a non-empty
string, `type` `prebuilt` or `dynamic`, nothing else. It creates a header with a new random UUID,
the given name and type, no attributes and an empty `attributeOrder`. A dynamic component also gets
a source definition (SRC-1). It answers:

| Case | Result |
| :-- | :-- |
| an invalid argument | `{ status: 'fail', text: 'Invalid data' }` |
| created | `{ status: 'success', text: 'Component created', uid }` |
| a permission denial | thrown |

- Test: `packages/core/src/lib/script/components/catalog.test.ts`
- Level: unit

#### CMP-7 · Reading the catalog

`/components/registrar` lists every valid header, of both kinds. `/components/registrar/<uid>`
shows one, with its history depth (HIS-1) and the time of its last publication, and answers 404
`No such component` for a reference with no valid header. A header that cannot be read, for any
reason, is absent (NF12).

- Test: `packages/core/src/lib/script/components/catalog.test.ts`, `packages/core/src/lib/script/components/componentHeader/io.server.test.ts`
- Level: unit

#### CMP-8 · Saving a header

The remote command `updateComponent({ header, version })` validates the header against CMP-4 and
applies CMP-5. A header whose `uid` names no stored component is refused with
`components/no-such-component: <uid> does not exist.` The header is stored with the stored `type`,
whatever `type` it carries, conditionally on `version` (HIS-2), and the step is recorded (HIS-1).
It answers `{ status: 'success', text: 'Component updated', historyLength, futureLength, version }`;
`{ status: 'fail', text: 'Invalid data' }` for an invalid argument; `{ status: 'fail', text }` with
the error's message for a CMP-5 refusal, an unknown component or a conflict; and throws any other
failure. The form actions `undo` and `redo` of `/components/registrar/<uid>` take the form field
`version` and step its history (HIS-1, HIS-2).

- Test: `packages/core/src/lib/script/components/componentHeader/user.server.test.ts`
- Level: unit

#### CMP-9 · Deleting a component

Deleting reads the stored header. A dynamic component loses its header, its header history, its
source directory `.genoacms/components/dynamic/<uid>/`, its publications directory and its pointer.
A prebuilt one loses its header, its header history, its publications directory and its pointer;
a reference that is not a prebuilt component is refused with an error whose message starts with
`components/not-prebuilt:`. Before anything is removed, deletion is refused while a published page
pins the component (CMP-10), with an error whose message starts with `components/in-use:` and
names the pages. Removing an object that is already absent is not a failure.

| Surface | Input | Refusal | Success |
| :-- | :-- | :-- | :-- |
| form action `delete` of `/components/registrar/<uid>` | the route | `components/in-use` as 409 `{ reason }`; others thrown | 307 to `.` |
| form actions `deleteSelected` of `/components/registrar` and `/components/editor` | `ids`, `names`: JSON arrays of strings; `confirmation`: the names joined by `, ` | 400 `{ reason }`: `selection/malformed`, `selection/empty`, `selection/mismatched`, `selection/not-confirmed`; a failure at the n-th as 409 `{ reason: 'selection/partial: removed <n> of <total>; <message>' }` | `{ success: true }` |
| remote form `deleteComponentRemote({ uid, name })` (dynamic only) | `name` must equal the component's | `{ status: 'fail', text: 'Confirmation phase "<name>" doesn\'t match "<actual>"' }`, or the in-use message | `{ status: 'success', text: 'Component deleted' }` |

Comparing confirmations ignores spaces around the commas. The editor's `deleteSelected` refuses a
prebuilt component as SRC-2 does.

- Test: `packages/core/src/lib/script/components/catalog.test.ts`, `packages/core/src/lib/script/components/componentHeader/io.server.test.ts`, `packages/core/src/lib/script/components/componentHeader/user.server.test.ts`, `packages/core/src/lib/script/components/page/tree/dependents.server.test.ts`, `packages/core/src/lib/script/components/registration.server.test.ts`
- Level: unit

#### CMP-10 · The pages that pin a component

The pages pinning a component are those whose published tree (TRE-1), listed from
`.genoacms/pages/readables/` and read verified, has a node, at any depth of any slot, whose `uid`
is the component's. Each is reported with the number of such nodes. A tree that cannot be read or
does not verify is reported as unreadable and does not refuse a deletion. The remote query
`pagesPinningComponent(uid)` answers `{ status: 'success', pages: [{ name, nodes }], unreadable }`,
or `{ status: 'fail', text, pages: [], unreadable: [] }`.

- Test: `packages/core/src/lib/script/components/catalog.test.ts`, `packages/core/src/lib/script/components/page/tree/dependents.server.test.ts` (unverified: a tree that cannot be read)
- Level: unit

#### CMP-11 · Component permissions

Each operation requires, before anything is read or written:

| Operation | Permission |
| :-- | :-- |
| listing the catalog or the dynamic components, reading a header or its history depth, a publication's status, the composable components | `components:read` |
| registering (CMP-6), deleting (CMP-9), listing the pages that pin a component (CMP-10) | `components:register` |
| saving a header, stepping its history | `components:modify` |
| reading a source definition, its signature preview or its history depth, saving a body, stepping its history | `components:code` |
| publishing (PUB-1) | `components:modify`, and `components:code` when the stored kind is `dynamic` |

No permission implies another. The permission is checked before the stored kind is read, except
when deleting through the registrar (NF18).

- Test: `packages/core/src/lib/script/components/componentHeader/user.server.test.ts`, `packages/core/src/lib/script/components/editor/user.server.test.ts`, `packages/core/src/lib/script/components/permissions.test.ts`, `packages/core/src/lib/script/components/publication/user.server.test.ts`, `packages/core/src/lib/script/components/registration.server.test.ts`
- Level: unit

### Source

#### SRC-1 · A source definition

```ts
interface ComponentDefinition {
  uid: string                 // the header's uid
  language: string            // selects the language adapter configured for it
  body: string                // the draft: the entry function's body, as the author wrote it
  publishedBody: string       // the body the last publication compiled; '' before the first
  publishedSignature: string  // the signature it was compiled around; '' before the first
}
```

A dynamic component is created with `language: 'typescript'` and every other field empty. A stored
definition that does not match fails the read with `Invalid component definition: <uid>`.

- Test: `packages/core/src/lib/script/components/catalog.test.ts`
- Level: unit

#### SRC-2 · Opening a component's source

`/components/editor/<uid>` shows the body, the signature preview (SRC-3) and the history depth. A
reference with no header answers 404 `components/no-such-component: <uid> does not exist.`; a
prebuilt component answers 404 `components/no-such-component: <uid> is a prebuilt component. …`.

- Test: `packages/core/src/lib/script/components/catalog.test.ts`, `packages/core/src/lib/script/components/editor/io.test.ts`
- Level: unit

#### SRC-3 · The signature preview

The preview is the language adapter's `emitSignature` of the header's `attributes` and
`attributeOrder`: the declaration a body is wrapped in, as text, and the diagnostics that stop the
shape being emitted. It is returned, not raised, when it has diagnostics.

- Test: `packages/core/src/lib/script/components/catalog.test.ts`
- Level: unit

#### SRC-4 · Saving a body

The remote form `saveComponentRemote({ uid, body, version })` validates `uid` as a UUID, `body` and
`version` as strings, writes the body into the definition conditionally on `version` (HIS-2) and
records the step (HIS-1). It answers `{ status: 'success', text: 'Code saved', historyLength,
futureLength, version }`, or `{ status: 'fail', text }` with `Invalid data` or any error's message.
Saving does not touch `publishedBody` or `publishedSignature`. The form actions `undo` and `redo` of
`/components/editor/<uid>` take the form field `version` and step its history.

- Test: `packages/core/src/lib/script/components/catalog.test.ts`, `packages/core/src/lib/script/components/editor/editing.server.test.ts`
- Level: unit

### History

#### HIS-1 · Undo and redo

A history is `{ history: Step[], future: Step[] }`, where a step is the list of `deep-diff`
differences between two states. Saving computes the step from the state storage held before to the
state saved; when there is a difference it is appended to `history` and `future` is emptied, and
otherwise the history is unchanged. The first save of a header records nothing. Undo reverts the
last step of `history` on the stored state and moves it to the end of `future`; redo applies the
last step of `future` and moves it back. Undo with an empty `history` and redo with an empty
`future` change nothing. For a header and a body they then write nothing; a page entry is written
anyway (PGE-7). The state is written before its history. An absent history is empty, and one whose
`history` or `future` is not an array is replaced by an empty one, with a console warning.

- Test: `packages/core/src/lib/script/components/componentHeader/editing.server.test.ts`, `packages/core/src/lib/script/components/componentHeader/io.server.test.ts`, `packages/core/src/lib/script/components/editor/editing.server.test.ts`, `packages/core/src/lib/script/components/layout.test.ts`, `packages/core/src/lib/script/components/page/entry/history.test.ts`, `packages/core/src/lib/script/undoRedo/index.test.ts`
- Level: unit

#### HIS-2 · Saves are conditional

Every read of a header, a source definition or a page entry for editing returns its storage
version (`contracts/storage.md` STOR-6), and every save of it, undo and redo included, writes on
condition that the object still has that version. An undo or redo with nothing to step writes
nothing, but still compares the version, after a read. When the version does not match, nothing is
written, no step is recorded, and the save fails with an error whose message is
`conflict/modified-since: <object> has changed since version <version>; read it again.`, where
`<object>` is `component <uid>`, `component source <uid>` or `page <name>`. An object read without a
version cannot be saved: the save fails with an error whose message starts with
`storage/unversioned:`. A successful save returns the new version.

| Surface | Carries the version | On a conflict |
| :-- | :-- | :-- |
| `updateComponent` (CMP-8), `saveComponentRemote` (SRC-4) | an argument `version`; the result carries the new one | `{ status: 'fail', text }` with the message; the screen shows `Changed elsewhere. Reload to see the latest version.` |
| the page form actions (PGE-4 to PGE-7) | the form field `version`; the page reloads after a success | 409 `{ reason }` with the message; the screen shows the same text |
| the undo and redo actions of the registrar and the editor | the form field `version` | 409 `{ reason }` with the message |

- Test: `packages/core/src/lib/script/components/conflict.test.ts`
- Level: unit

### Publication

#### PUB-1 · Publishing

The remote form `publishComponentRemote({ componentId, note })`, where `componentId` is a UUID and
`note` a string, publishes in this order, and writes nothing before the last step:

```pseudo
check permissions (CMP-11)
read the header            — none: components/no-such-component: <uid> does not exist.
read the definition (dynamic) and the pointer
apply PUB-2
publicationId = random UUID; publishedAt = now (ms since epoch)
dynamic: read the security policy once; analyze (PUB-3); compile (PUB-3); emit the signature
sign the publication (PUB-4) with the current subordinate key
write the publication once, then the pointer and, for a dynamic component, the definition (PUB-5)
```

The publisher is the principal's subject, never a value of the request.

- Test: `packages/core/src/lib/script/components/publication/index.test.ts`, `packages/core/src/lib/script/components/publication/publishing.test.ts`, `packages/core/src/lib/script/components/publication/user.server.test.ts`
- Level: unit

#### PUB-2 · No change, no publication

A component may be published when it has no pointer, or when the pointer's `headerDigest` differs
from the description's digest, or, for a dynamic component, when `body` differs from
`publishedBody`, or the emitted signature's text differs from `publishedSignature`. Otherwise
publishing is refused with `Nothing has changed since the last publication: neither the
component's description nor, where it has one, its code.` The description's digest is the lowercase
hex of SHA-256 over the RFC 8785 form of `{ type, name, attributes, attributeOrder }`.

- Test: `packages/core/src/lib/script/components/publication/index.test.ts`, `packages/core/src/lib/script/components/publication/payload.test.ts`, `packages/core/src/lib/script/components/publication/publishing.test.ts`
- Level: unit

#### PUB-3 · Analysis and compilation

The language adapter of the definition's `language` analyzes `{ body, shape, fetchOrigins }` and
compiles `{ body, shape, platform, ceilings, fetchOrigins }`, where `shape` is the header's
`attributes` and `attributeOrder`, `platform` the first the adapter declares, and `ceilings` and
`fetchOrigins` come from the one reading of the security policy. The first `fatal` diagnostic of
either refuses the publication with its message, followed by ` (line <l>)` or
` (line <l>, column <c>)` when it has them. An adapter with no platform refuses with
`The adapter for '<language>' declares no platform to compile for`; a compilation with no code and
no fatal diagnostic with `The adapter for '<language>' returned no code and gave no reason`. The
analysis's warnings are returned to the publisher (PUB-6).

- Test: `packages/core/src/lib/script/components/publication/index.test.ts`, `packages/core/src/lib/script/components/publication/publishing.test.ts`
- Level: unit

#### PUB-4 · The publication

A publication is a signed envelope of the type `genoacms.componentPublication.v1`, signed by the
current subordinate key, as COL-7 describes the envelope:

```ts
interface ComponentPublication {
  uid: string
  publicationId: string
  publisherId: string          // AuthContext.subject of the publisher
  publishedAt: number          // ms since epoch
  note: string                 // may be empty
  type: 'prebuilt' | 'dynamic'
  name: string
  attributes: Record<string, Attribute>
  attributeOrder: string[]
  executables?: Array<{        // absent, never empty, for a prebuilt component
    platform: string
    executableCode: string     // the compiled bundle
    compiledAt: number
    ceilings: { maxFuel: number, maxDepth: number, maxAllocation: number }
  }>
}
```

Building it refuses, before signing: a blank `uid`, `publicationId`, `publisherId`, `name` or
`platform`; a timestamp that is not a finite number; a prebuilt component with `executables`; a
dynamic one with none; an empty `executableCode`; ceilings that are not three positive whole
numbers; two executables for one platform. A dynamic component's publication has one executable.

- Test: `packages/core/src/lib/script/components/publication/index.test.ts`, `packages/core/src/lib/script/components/publication/payload.test.ts`, `packages/core/src/lib/script/components/publication/publishing.test.ts`
- Level: unit

#### PUB-5 · Writing a publication

The publication is written at the path its own `uid` and `publicationId` name, only if no object is
there; one that is fails with an error whose message starts with `components/publication-exists:`.
Then, in either order, the pointer is written, and for a dynamic component the definition with `publishedBody` set to
the body that was compiled and `publishedSignature` to the signature it was compiled around:

```ts
interface PublishedComponent {   // the pointer
  uid: string
  publicationId: string          // the latest publication
  publisherId: string
  publishedAt: number
  note: string
  headerDigest: string           // PUB-2
}
```

A pointer that cannot be read is no pointer (NF12); one that does not match fails the read with
`Invalid publication record for component <uid>`.

- Test: `packages/core/src/lib/script/components/publication/index.test.ts`, `packages/core/src/lib/script/components/publication/publishing.test.ts`
- Level: unit

#### PUB-6 · What publishing answers

`publishComponentRemote` answers `{ status: 'success', text: 'Component published', publicationId,
publishedAt, warnings }`, where each warning is `{ rule, message, line? }`. It answers
`{ status: 'fail', text: 'Invalid data' }` for an invalid argument, and `{ status: 'fail', text }`
with the error's message for every failure, a permission denial included.

- Test: `packages/core/src/lib/script/components/publication/publishing.test.ts`
- Level: unit

#### PUB-7 · Composable components

The components a page may be composed from are the valid headers whose component has a pointer, in
the catalog's order, of either kind. The page screens offer only these, filtered for a slot by its
`items.enum` when that is a non-empty list.

- Test: `packages/core/src/lib/script/components/publication/composition.test.ts`
- Level: unit

### Pages

#### PGE-1 · A page entry

```ts
interface PageEntry {
  name: string
  previewURL: string                       // where the consuming site shows the page; '' at first
  contents: {
    nodes: Record<string, ComponentNode>   // keyed by node uid
    rootNodeUid: string
  }
  history: Step[]                          // HIS-1, over contents
  future: Step[]
  lastModified: string                     // ISO 8601, set on every write
}

interface ComponentNode {
  uid: string                              // a random UUID
  entryReference: string                   // the component's uid
  name?: string                            // MAY be stored; replaced on read (PGE-3)
  data: Record<string, {                   // keyed by attribute uid
    uid: string
    name: string                           // the attribute's schema.title
    type: AttributeType
    schema?: object                        // MAY be stored; replaced on read
    value: AttributeValue                  // CMP-3
  }>
}
```

A slot's value lists node uids of the same page.

- Test: `packages/core/src/lib/script/components/page/pages.test.ts`
- Level: unit

#### PGE-2 · Creating a page

The form action `createPage` of `/components/pages` reads `name` and `componentUID`; when either is
missing it fails with 400 `{ reason: 'no-page-name' }`. A name PGE-11 refuses fails with 400
`{ reason: 'pages/invalid-name' }`; a name taken, with 409 `{ reason: 'pages/exists' }`; a
component with no valid header or no publication, with 400
`{ reason: 'pages/unpublished-component' }`. Otherwise it creates an entry named `name`, with an
empty preview URL and one root node of the component, written only if no entry of that name exists,
and answers 307 to `pages/<name>`. A new node has a value for every attribute of the component's
stored header: the schema's `default` when it is truthy, otherwise `false`, `0`, `''`, or `[]` for
`link`, `storageResource` and `components`.

- Test: `packages/core/src/routes/(admin)/components/pages/actions.test.ts`
- Level: unit

#### PGE-3 · Opening a page

`/components/pages` lists the entry names. `/components/pages/<name>` redirects 307 to
`<name>/<rootNodeUid>`, and a node uid the page lacks redirects to the root node. Reading an entry
rebuilds each node from its component's current header: `name` becomes the header's name; the data
holds one value per attribute the header has, keeping the stored value when the node has one and a
new value (PGE-2) otherwise, with the attribute's current name and schema; values of attributes the
header no longer has are dropped. An entry that cannot be read, or one with a node whose component
has no header, answers 404 `No page named "<name>"`.

- Test: `packages/core/src/lib/script/components/page/pages.test.ts`
- Level: unit

#### PGE-4 · Editing a node

The form actions `update` and `updateAndGenerateTree` of `/components/pages/<name>/<nodeUid>` read
`componentNode`, a JSON node, and `version`; without them they fail with 400
`{ reason: 'no-diff' }`. Of the node sent, only `data[<attribute uid>].value` is read, for the
attributes of the stored node; any other field is ignored. Each value of a non-slot attribute is
checked as TOL-11 checks it; one that fails fails the action with 400
`{ reason: 'pages/invalid-value: <attribute uid>: <what does not match>' }`. A slot's value may
only be a reordering of the stored slot's node uids with some removed; another fails with 400
`{ reason: 'pages/invalid-slot: <attribute uid>' }`. A change to a value of a non-slot attribute
requires `pages:content_edit`, a change to a slot `pages:structure_edit`. A node removed from a
slot is removed from the page with every node below it. The action records one step (HIS-1), writes
the entry conditionally on `version` (HIS-2), and `updateAndGenerateTree` then builds the page
(TRE-1). A node uid the page lacks fails with 404 `{ reason: 'pages/no-such-node' }`.

- Test: `packages/core/src/lib/script/components/page/edits.test.ts`, `packages/core/src/routes/(admin)/components/pages/actions.test.ts`
- Level: unit

#### PGE-5 · Adding a child node

The form action `addChildNode` of `/components/pages/<name>/<nodeUid>` reads `componentUID`,
`attributeUID` and `version`; without them it fails with 400 `{ reason: 'no-component' }`,
`{ reason: 'no-target-attribute' }` or `{ reason: 'no-version' }`. It adds a node of the component
as TOL-10 adds one at the end of the slot, with TOL-10's refusals as 400 `{ reason }` (404 for
`pages/no-such-node`), records the step and writes the entry conditionally on `version`.

- Test: `packages/core/src/routes/(admin)/components/pages/actions.test.ts`
- Level: unit

#### PGE-6 · The preview URL and files

The form action `changePreviewURL` reads `value` and `version` and writes `value` as the entry's
`previewURL` conditionally on `version`, without recording a step; without them, it fails with 400
`{ reason: 'no-diff' }`.

- Test: `packages/core/src/lib/script/components/page/pages.test.ts`
- Level: unit

#### PGE-7 · Undoing and redoing a page

The form actions `undo` and `redo` of `/components/pages/<name>/<nodeUid>` read `version`, step the
entry's history (HIS-1) over `contents`, and write the entry conditionally on `version` (HIS-2),
also when there was nothing to step.

- Test: `packages/core/src/lib/script/components/page/pages.test.ts`
- Level: unit

#### PGE-8 · Deleting pages

Deleting a page removes its entry, and then its published tree. A failure to remove the entry
propagates. A failure to remove the tree is logged as a warning
`[genoacms:pages] deleted the entry for <name> but not its readable tree: <message>. …`, and the
deletion succeeds. The form action `deleteSelected` of `/components/pages` deletes by name, with
the input, refusals and answers of CMP-9's `deleteSelected`.

- Test: `packages/core/src/lib/script/components/page/pages.test.ts`
- Level: unit

#### PGE-9 · Pages and the components they use

A page is not changed when a component it uses changes: reading it applies PGE-3, and building it
applies TRE-2. Nothing records on a component which pages use it, except their published trees.

- Test: `packages/core/src/lib/script/components/page/pages.test.ts`
- Level: unit

#### PGE-10 · Page permissions

Each operation requires, before it writes:

| Operation | Permission |
| :-- | :-- |
| listing pages, reading an entry | `pages:read` |
| creating a page (PGE-2), adding a child node (PGE-5) | `pages:structure_edit` |
| editing the values of a node (PGE-4), the preview URL (PGE-6) | `pages:content_edit` |
| changing a slot of a node (PGE-4) | `pages:structure_edit` |
| undo and redo (PGE-7) | `pages:content_edit` and `pages:structure_edit` |
| building (TRE-1) | `pages:content_edit` and `pages:publish` |
| deleting (PGE-8) | `pages:delete` |

Every action on an existing page reads its entry first, and so also requires `pages:read`.
Opening the page screens also requires `components:read` (PUB-7).

- Test: `packages/core/src/lib/script/components/page/user.server.test.ts`, `packages/core/src/lib/script/components/permissions.test.ts`
- Level: unit

#### PGE-11 · Page names

A page name has 1 to 200 characters, none of them `/`, `\` or a control character (U+0000 to
U+001F, U+007F), and is neither `.` nor `..`. It is appended to `.genoacms/pages/entries/` and
`.genoacms/pages/readables/` as given, never through a path library. Creating a page with any other
name fails with 400 `{ reason: 'pages/invalid-name' }`, and with a name an entry already has, with
409 `{ reason: 'pages/exists' }`; nothing is written. A page is created only if no entry of its name
exists (`ifAbsent`).

- Test: `packages/core/src/lib/script/components/page/edits.test.ts`, `packages/core/src/routes/(admin)/components/pages/actions.test.ts`
- Level: unit

### Published page tree

#### TRE-1 · Building a page

Building turns the stored entry into a tree (TRE-2) from its root node, signs it as an envelope of
the type `genoacms.pageTree.v1` with the current subordinate key, as COL-7 describes the envelope,
and writes it to `.genoacms/pages/readables/<name>`, replacing any tree there. The tree records
neither who built it nor when. Reading a tree back verifies it; one that does not verify fails with
an error whose message starts with `pages/tree-unverifiable:`, and an absent one is none.

- Test: `packages/core/src/lib/script/components/page/pages.test.ts`, `packages/core/src/lib/script/components/page/tree/io.server.test.ts`
- Level: unit

#### TRE-2 · A node of the tree

```ts
interface ReadablePageNode {
  component: string                         // the component's name
  type: 'prebuilt' | 'dynamic'
  uid?: string                              // present exactly when publicationId is
  publicationId?: string                    // the pointer's publication when the page was built
  data: Record<string, ReadableAttributeValue>   // keyed by attribute name
}

type ReadableAttributeValue = boolean | number | string | string[] | ReadablePageNode[]
```

A node of a component with a pointer carries its `uid` and the pointer's `publicationId`, read when
the page is built. A node of a component never published carries neither.

- Test: `packages/core/src/lib/script/components/page/pages.test.ts`, `packages/core/src/lib/script/components/page/tree/index.test.ts`
- Level: unit

#### TRE-3 · Values in the tree

| Attribute type | Value in the tree |
| :-- | :-- |
| `boolean`, `number`, `string`, `text` | the value as stored |
| `markdown` | the HTML of `marked`, sanitized by DOMPurify |
| `richText` | `''` |
| `link` | one URL per link, in order: an external link's `url`, or `''`; an internal link's target page entry's `previewURL`, or `''` without a `pageName` |
| `storageResource` | one URL per object, in order: its public URL from the storage adapter, or `''` when that fails |
| `components` | the nodes of the slot, in order (TRE-2) |

An internal link to a page with no entry fails the build.

- Test: `packages/core/src/lib/script/components/page/pages.test.ts`, `packages/core/src/lib/script/components/page/tree/index.test.ts`
- Level: unit
