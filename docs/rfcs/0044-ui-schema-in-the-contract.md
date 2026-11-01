---
type: rfc
number: 44
title: uiSchema is declared in the contract's CollectionReference
status: draft
depends: [42]
architecture: [architecture/contracts/database.md, architecture/collections.md]
changes: [DATA-1 added]
commit-subject: "feat(contracts): declare uiSchema in CollectionReference (RFC-0044)"
---

# RFC-0044: uiSchema is declared in the contract's CollectionReference

## Summary

The collection listing hides a column whose field is marked `uiSchema[<field>].showPreview === false`
(`collections.md` LST-1), and COL-4 lists `uiSchema` among the fields core reads. The contract's
`CollectionReference` (`contracts/database.md` DATA-1) has no `uiSchema`, so a config author gets no
type for it, and core reads it through a cast in `listing.ts` and a type error in `utils.ts` (OF6).
The author decided that the contract declares it (OU9). This RFC:

1. Adds the optional `uiSchema` to DATA-1 and to `CollectionReference` in `@genoacms/contracts`.
2. Removes core's cast in `listing.ts`, and the unused `preview` option of
   `extractDocumentProperties` in `utils.ts`, which was the only other reader.
3. Documents the field in the configuration guide.

Released as a patch of `@genoacms/contracts` (0.2.0 to 0.2.1): an added optional field, below 1.0.

## Files

**Modify only:**

| File | Change |
| :-- | :-- |
| `packages/contracts/src/database/types.d.ts` | `uiSchema?` on `CollectionReference`; exported type `CollectionUiSchema` |
| `packages/contracts/src/database/types.test-d.ts` | new: the type tests of §Tests, run by vitest's `typecheck` (`vitest.config.js`, CF33) |
| `packages/core/src/routes/(admin)/collections/[collectionName]/listing.ts` | `uiSchemaOf` reads `reference.uiSchema` without a cast |
| `packages/core/src/routes/(admin)/collections/[collectionName]/listing.test.ts` | `collectionOf` builds a `CollectionReference` without `as` |
| `packages/core/src/routes/(admin)/collections/[collectionName]/utils.ts` | `extractDocumentProperties(reference)` loses its `{ preview }` option |
| `packages/docs/src/routes/guide/config/services/+page.md` | a bullet for `uiSchema` |
| `.changeset/ui-schema-in-collection-reference.md` | new: patch of `@genoacms/contracts` |

## Specification

### Changed

#### DATA-1 · Collections, references and snapshots

```ts
interface CollectionReference {
  name: string
  primaryKey: { key: string, schema: JsonSchema }
  schema: JsonSchema
  uiSchema?: CollectionUiSchema
}
type CollectionUiSchema = Record<string, { showPreview?: boolean }>
interface DocumentReference<C extends CollectionReference> { collection: C, id: string }
interface DocumentSnapshot<C> { reference: DocumentReference<C>, data: Document<C> }
interface CollectionPage<C> { documents: Array<DocumentSnapshot<C>>, next?: string }
```

`primaryKey.key` names the one field holding a document's ID, and `id` is a string. `uiSchema` is
keyed by field name and tells the CMS how to show a field; an adapter ignores it.

- Test: `packages/contracts/src/database/types.test-d.ts`
- Level: unit

`changes`: DATA-1 `added` (a new optional member; every value that was a `CollectionReference` still
is one).

### Core

`listing.ts`:

```ts
// LST-1
const uiSchemaOf = (reference: CollectionReference): CollectionUiSchema => reference.uiSchema ?? {}
```

`utils.ts`: `extractDocumentProperties = (reference: CollectionReference) => …`, the loop without the
`propConfig` lines. Its one caller, `Editor.svelte`, passes no options, so the editor's behaviour is
unchanged. COL-4 is already true as written; only its `CollectionDefinition` block becomes identical
to `CollectionReference`, and is replaced by a reference to DATA-1 when the document is brought
current.

## Non-goals

- Other `uiSchema` options (order, labels, widgets). Only `showPreview` is read today.
- Validating `uiSchema` at config load or in a dynamic collection's definition (RFC-0035). A
  definition carrying an unknown field keeps being accepted as it is today.
- The other open findings of `collections.md`.

## Tests

Level `unit`.

`packages/contracts/src/database/types.test-d.ts`, describe `CollectionReference`:

| Title | Given / when / then |
| :-- | :-- |
| `DATA-1: a reference may carry a uiSchema keyed by field` | Given `{ name, primaryKey, schema, uiSchema: { body: { showPreview: false } } }`; then it is assignable to `CollectionReference` (`expectTypeOf(...).toExtend<CollectionReference>()`). |
| `DATA-1: a reference without uiSchema is still a reference` | Given `{ name, primaryKey, schema }`; then it is assignable to `CollectionReference`. |
| `DATA-1: showPreview is a boolean` | Given a `CollectionReference` literal with `uiSchema: { body: { showPreview: 'no' } }`; then it does not type-check (`// @ts-expect-error`). |

The first test fails today: a fresh literal with `uiSchema` is an excess property. The third passes
today for that same reason, and keeps passing after the change because of the `boolean`.

`listing.test.ts` keeps its LST-1 tests; their `collectionOf` builds the reference without `as`, and
no assertion changes. `pnpm --filter @genoacms/core run check` drops the `utils.ts` error.

## Steps

1. Commit the architecture change (`collections.md` OU9, OF6 decided) and this RFC, separately.
2. Write the type tests, then implement the contract type, §Core, the guide bullet and the
   changeset. A type test cannot be marked as an expected failure, so the tests are committed with
   the code; before implementing, `pnpm --filter @genoacms/contracts test` shows the first one
   failing. Commit with the `commit-subject`.
3. Update `contracts/database.md` DATA-1 and `collections.md` (COL-4 refers to DATA-1, OF6
   *History.* fixed), `verified`; this RFC `auditing` with its commits. Commit:
   `docs: DATA-1 current (RFC-0044)`.

## Verification

```bash
pnpm --filter @genoacms/contracts test
# all pass
pnpm --filter @genoacms/core run check
# no error in listing.ts or utils.ts
pnpm --filter @genoacms/core exec vitest run "src/routes/(admin)/collections"
# all pass
GOOGLE_APPLICATION_CREDENTIALS=… GENOACMS_TEST_GCP=1 pnpm --filter @genoacms/core exec vitest run --mode e2e e2e/collections.test.ts
# LST-1 with the hidden column passes
node docs/tools/check-docs.mjs docs
# 0 error(s)
```

## Critique

**Pros**
- A config author sees the option, and a typo in `showPreview` becomes a type error.
- Core loses a cast and a dead branch; the listing is the one reader of `uiSchema`.
- No runtime change anywhere: the listing already honoured the field.

**Cons & trade-offs**
- A UI concern enters the database contract, which adapters implement. They ignore it, but the
  contract now carries a field that is about the CMS, not the store.
- The name `uiSchema` suggests the JSON Forms / RJSF vocabulary, which it does not follow. Renaming
  it would break configs that use it untyped today.

**Blindspots & missed edge cases**
- A `uiSchema` key that names no field of `schema.properties` is accepted and ignored; nothing warns.
- Dynamic collection definitions (RFC-0035) are signed as written. Whether any stored definition
  already carries `uiSchema` is not known; if one does, it keeps working, and if one carries a
  malformed `uiSchema`, the listing reads it as it does today, with `showPreview !== false`.
- The type tests prove the declaration, not that the listing reads it; LST-1's unit and e2e tests
  keep covering the hidden column.
