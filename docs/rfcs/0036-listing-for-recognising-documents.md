---
type: rfc
number: 36
title: A collection listing for recognising documents
status: implemented
commits: [16439a8, 3d48988]
depends: [35]
architecture: [architecture/collections.md]
changes: [LST-1 compatible, LST-3 compatible, LST-7 added, LST-8 added]
commit-subject: "feat(core): one-line listing rows shown by field kind, with a filter (RFC-0036)"
---

# RFC-0036: A collection listing for recognising documents

## Summary

The collection listing prints each value raw (LST-1): a long text wraps into a row taller than the
screen, an object reads `[object Object]`, a list `1 items`, and every column is as wide as every
other whatever it holds. The author asked on 2026-10-11 for a listing that shows as much as it can,
makes a document easy to find, and does not overwhelm (OU5, OD14).

The change:

1. Every row is one line. A cell is cut short with an ellipsis and carries its full text as its
   title (LST-1).
2. The lead field, the first of kind `string`, `text` or `markdown`, has the first column (LST-1).
3. A cell shows its value by the field's kind, the classification the editor already uses (LST-8).
4. The header and the rows share one grid; short kinds get narrow columns, and the listing scrolls
   sideways when the columns do not fit (LST-1).
5. A filter narrows the rows already loaded, and the count shows how many are shown (LST-7). Select
   all selects the rows shown (LST-3).

## Files

**Modify or create only:**

| File | Change |
| :-- | :-- |
| `packages/core/src/routes/(admin)/collections/[collectionName]/listing.ts` | new: columns, cells, filtering and the count of §Core |
| `packages/core/src/routes/(admin)/collections/[collectionName]/listing.test.ts` | new: the unit tests of §Tests |
| `packages/core/src/routes/(admin)/collections/[collectionName]/+page.svelte` | the count, the filter, the shown rows, Select all's ids |
| `packages/core/src/routes/(admin)/collections/[collectionName]/Header.svelte` | the grid of columns |
| `packages/core/src/routes/(admin)/collections/[collectionName]/Document.svelte` | one grid row of cells |
| `packages/core/src/routes/(admin)/collections/[collectionName]/Cell.svelte` | new: one cell |
| `packages/core/src/routes/(admin)/collections/[collectionName]/Filter.svelte` | new: the filter field |
| `packages/core/src/routes/(admin)/collections/[collectionName]/SelectAll.svelte` | the ids it selects come as a prop |
| `packages/core/e2e/collections.test.ts` | the e2e tests of §Tests |
| `docs/architecture/collections.md` | to current, step 5 |
| `.changeset/listing-for-recognising-documents.md` | new: `patch` for `@genoacms/core` |

## Specification

**LST-1 · The listing** (changed, compatible):

> `/collections/<name>` shows the heading `Collection: <name>`, the count `<n> documents` (`1
> document`), a header row of field names and one row per document of the collection, read without
> query parameters. A field whose `uiSchema[<field>].showPreview` is `false` has no column. The lead
> field, the first field with a column of kind `string`, `text` or `markdown` (EDT-4), has the first
> column, and the other fields follow in the schema's order. A collection with no column shows a
> column `id` of each document's id instead. Every row is one line high: a cell shows what LST-8
> says, cut short with an ellipsis when it does not fit. The header and the rows share one grid, so
> each field name stands over its column; a column of kind `boolean`, `number`, `list`,
> `references` or `files` is narrow, at most `8rem`, and the listing scrolls sideways when the columns do not fit.
> Each row links to `/collections/<name>/<id>`.
>
> - Test: `packages/core/src/routes/(admin)/collections/[collectionName]/listing.test.ts`, `packages/core/e2e/collections.test.ts`
> - Level: unit, e2e

**LST-3 · Selecting documents** (changed, compatible): "every listed id" becomes "the id of every row
shown (LST-7)".

> Each row has a checkbox named `Select <id>`, which toggles the document's id in the selection. A
> selection with a cap (LST-5) hides the checkboxes of unselected rows when full; a selected row can
> always be deselected. Select all adds the id of every row shown (LST-7), and is shown while the
> selection is empty; Unselect all clears it otherwise.
>
> - Test: `packages/core/e2e/collections.test.ts`
> - Level: e2e

**LST-7 · Filtering the listing** (added): as `collections.md` states it.

**LST-8 · What a cell shows** (added): as `collections.md` states it.

### Core

`listing.ts`, pure:

```ts
import type { CollectionReference } from '@genoacms/contracts/database'
import type { FieldKind } from './Editor/fieldKind'

interface Column { name: string, kind: FieldKind, isLead: boolean, isDocumentId: boolean }
type CellLook = 'text' | 'mono' | 'number' | 'check' | 'muted'
interface Cell { text: string, title: string, look: CellLook, isEmpty: boolean }

function columnsOf (reference: CollectionReference): Column[]
function cellOf (kind: FieldKind, value: unknown): Cell
function cellsOf (columns: Column[], id: string, data: Record<string, unknown>): Cell[]
function plainMarkdown (source: string): string
function gridTemplate (columns: Column[]): string          // grid-template-columns
function minimumWidth (columns: Column[]): string          // the width below which the listing scrolls
function isEndAligned (column: Column): boolean            // number and count columns
function matchesFilter (id: string, cells: Cell[], query: string): boolean
function documentCount (shown: number, total: number, isFiltering: boolean): string
```

- `columnsOf` takes the fields of `schema.properties` in order, drops those whose
  `uiSchema[<field>].showPreview` is `false`, classifies each with `fieldKindOf`, and moves the lead
  field, the first of kind `string`, `text` or `markdown`, to the front with `isLead: true`.
- `cellOf` implements LST-8. An empty cell is `{ text: '—', title: 'empty', look: 'muted',
  isEmpty: true }`; `false` is `{ text: '–', title: 'false', look: 'muted' }`; `true` is
  `{ text: '', title: 'true', look: 'check' }`; a count is `{ text: '<n>', title: '<n> item(s)',
  look: 'number' }`.
- `plainMarkdown` walks the tokens of `marked`'s `lexer`, taking the `text` of the leaf tokens and
  descending into `tokens` and `items`, skipping `html`, `space` and `hr`; it joins blocks with a
  space and collapses runs of whitespace.
- `gridTemplate` gives a lead column `minmax(12rem, 3fr)`; `boolean`, `number`, `list`,
  `references` and `files` a fixed width, the larger of `5.5rem` and the field name's length at
  `0.5rem` a character plus `1.5rem`, rounded up to a half rem, and at most `8rem`; `uuid`, `reference`, `enum`, `const` and `file`
  `minmax(7rem, 1fr)`; any other `minmax(8rem, 2fr)`. `minimumWidth` sums the minimums.
- `matchesFilter` is true for a trimmed query that is empty, and otherwise when the id or the
  `title` of a cell that is not empty contains it, both folded: `normalize('NFD')`, combining marks
  (`\p{M}`) removed, `toUpperCase()`.
- `plainMarkdown` decodes the HTML entities `marked` leaves in its tokens' `text`; it joins inline
  tokens directly and block tokens, list items, table cells and `br` with a space.
- `columnsOf` gives, for a collection with no column, one lead column `id` with `isDocumentId:
  true`, whose cell is the document's id; `cellsOf(columns, id, data)` gives a row's cells.
- `documentCount` gives `<n> document(s)`, or `<shown> of <n> document(s)` while filtering.

`+page.svelte` keeps the query in `$state('')`, derives the columns once, each document's cells, and
the rows that match. It shows the count and `Filter` under the heading, passes the shown ids to
`SelectAll` as `documentIds`, and wraps `Header` and the rows in an `overflow-x-auto` container
whose inner element has `min-width: minimumWidth(columns)`. `Header` and `Document` set
`grid-template-columns: gridTemplate(columns)` on a grid that follows the selection gutter, and align
the label and every cell of a column `isEndAligned` gives to the end;
`Document`'s grid is the row's link. `Cell` renders one `<span>` with `title`, `truncate`, and the
look's classes: `font-mono` for `mono`, `text-end tabular-nums` for `number`, a
`bi bi-check-lg` icon for `check`, `text-surface-500` for `muted`; a lead cell is `font-medium`.
`Filter` is an `<input type="search">` labelled `Filter documents`, bound to the query.

## Non-goals

- Querying the database, paging or sorting (OF8): the filter searches the documents loaded.
- Resolving a reference to its document's label, or a file to a preview.
- Choosing columns, their order or their width in the interface.
- The schema field `id`, which is not the document's id (OF5).
- The listing as a picker beyond Select all (LST-5).

## Tests

- `packages/core/src/routes/(admin)/collections/[collectionName]/listing.test.ts` (unit):
  - › `LST-1: the lead field comes first, the others keep the schema's order, hidden fields have no column`:
    given properties `id` (uuid), `count` (number), `title` (string), `body` (markdown), `secret`
    (string, `showPreview: false`), then the column names are `title`, `id`, `count`, `body`, and
    only `title` is the lead.
  - › `LST-1: without a text-like field no column leads`: given `id` (uuid) and `count` (number), then
    the names are `id`, `count` and none is the lead.
  - › `LST-1: a collection with no column shows each document's id`: given only a hidden field, then
    the one column is `id`, the lead, and `cellsOf` gives the document's id as its cell.
  - › `LST-1: a narrow column is at most 8rem, however long its name`: a boolean named with 33
    characters gets `8rem`.
  - › `LST-1: short kinds get narrow columns`: `gridTemplate` of a lead, a boolean and a string
    column is `minmax(12rem, 3fr) 5.5rem minmax(8rem, 2fr)`, and `minimumWidth` is `25.5rem`.
  - › `LST-8: each kind shows its value`: for each row of LST-8's table, a value of the kind gives
    the text, title and look the table and §Core say: `'abc'` string; `'a…'` uuid in `mono`; `3`
    number; `true` and `false`; `[1, 2]` list `2` titled `2 items`, `[1]` `1 item`;
    `{ bucket: 'b', name: 'e2e/cover.png' }` file `cover.png`; `{ minutes: 3, tags: [], seo: {},
    slug: 'x', empty: '' }` object `minutes: 3 · slug: x`; a markdown `# Head\n\nSome *text*.` is
    `Head Some text.`
  - › `LST-8: markdown reads as rendered text, entities decoded, blocks, items, cells and breaks spaced`:
    `A & B, 5 < 6, "q" 's' and \`x & y\` and Tom &amp; Jerry` reads the same with `&amp;` as `&`
    and the backticks gone; a table `a b / 1 2` reads `a b 1 2`; a nested list `one two nested`; a
    hard break `line one line two`; a quote, a link and an image `quoted link alt`.
  - › `LST-8: absent, null, empty and misshapen values show an empty cell`: `undefined`, `null`, `''`
    for a string, `'x'` for a number, `{}` for a list, `7` for an object and `{ tags: [] }` for an
    object, a `file` given a string, an `unsupported` object and a string of spaces all give
    `{ text: '—', title: 'empty', look: 'muted', isEmpty: true }`; an object `{ a: '  ', b: 1 }`
    shows `b: 1`.
  - › `LST-7: the filter matches the id or a cell's title, trimmed and ignoring case`: given cells
    titled `Hello World` and `2 items` and an empty cell, then `'  world '`, `'2 ITEMS'` and the id's
    `'Doc-1'` match, `'empty'` and `'nothing'` do not, and `''` and `'  '` match.
  - › `LST-7: the filter ignores diacritics and folds case beyond ASCII`: given cells `İstanbul`,
    `Straße` and `Příliš žluťoučký kůň`, then `istanbul`, `STRASSE`, `zlutoucky` and `KŮŇ` match.
  - › `LST-1, LST-7: the count reads documents, or shown of documents while filtering`:
    `documentCount(1, 1, false)` is `1 document`, `(5, 5, false)` `5 documents`, `(2, 5, true)`
    `2 of 5 documents`.
- `packages/core/e2e/collections.test.ts` (e2e), in the listing's tests, given the suite's fixtures
  and one article whose title is `<run> long` followed by `word` repeated 200 times:
  - › `LST-1: rows are one line high, cut short with their full text as title, under their field names`,
    replacing nothing: when the administrator opens `/collections/articles`, then the row of the
    long article is as tall as the row of `<run> article`, its title cell's `title` is the whole
    title, the first header label is `title`, and each header label's left edge equals the left edge
    of the first row's cell in its column.
  - › `LST-1: omits a field hidden from the preview, and counts the items of an array`, whose
    assertion `toContain('2 items')` becomes: the article's row holds a cell titled `2 items` that
    shows `2`.
  - › `LST-8: an object shows its fields, never [object Object]`: then the article row's `metadata`
    cell shows `readingTimeMinutes: 3`, and no row contains `[object Object]`.
  - › `LST-7, LST-3: the filter narrows the rows, the count follows, and Select all selects only the rows shown`:
    when the administrator types `  <RUN> LISTED ` into `Filter documents` on `/collections/authors`,
    then only the row of `<run> listed` is shown and the count reads `1 of <n> documents`; when
    Select all is clicked and Delete then clicked, the question is `Do you want to delete one
    document?`, which is declined, and Unselect all clears the selection; when a link to
    `/collections/articles` is then followed in the page, the filter field is empty and the count
    reads `<n> documents`. Its title becomes `LST-7, LST-3: the filter narrows the rows, the count
    follows, Select all selects only the rows shown, and another collection opens unfiltered`.

## Steps

1. Baseline: `pnpm --filter @genoacms/core exec vitest run` passes; the collections e2e suite passes;
   `node docs/tools/check-docs.mjs docs` reports 0 errors.
2. Tests: write the tests of §Tests; mark `it.fails` each that fails before the code, and only those.
   Commit them. The unit tests import `listing.ts`, which the code creates, so they cannot load before
   it and are committed with the code.
3. Code: the files of §Files, and the changeset; remove every `it.fails`, change no assertion.
4. Run §Verification.
5. `collections.md` to current: LST-1 and LST-3 take the text of §Specification; LST-7 and LST-8 lose
   their `State:` lines and name their tests; `verified` moves to the code commit; `docs/README.md`'s
   rows count the statements.

## Verification

```bash
pnpm --filter @genoacms/core exec vitest run
# all tests pass, the listing tests among them
GENOACMS_TEST_GCP=1 pnpm --filter @genoacms/core exec vitest run --mode e2e e2e
# all tests pass
node docs/tools/check-docs.mjs docs
# 0 error(s)
```

A falsification audit of LST-1, LST-3, LST-7 and LST-8 (WORKFLOW §6.3), by an agent that did not
write the code, recorded as a Verification entry in `collections.md`.

## Critique

**Pros**
- A row is one line whatever it holds, so a screen shows the same number of documents for every
  collection, and the eye runs down a column.
- No value reaches the screen raw: objects, lists, files, booleans and markdown each have a short
  form, decided by the same classification as the editor's controls.
- The lead field names each row without configuration, in the place a reader looks first.
- The filter finds a document by any text a row shows, instantly, without a request.

**Cons & trade-offs**
- A long value is cut short; seeing it whole needs a hover, which touch screens lack, or opening the
  document.
- Moving the lead field to the front breaks the schema's order of columns, which some authors chose
  on purpose.
- The object summary is a guess: it shows only an object's own scalar fields, so an object of nested
  objects shows nothing.
- The filter searches what is loaded; once the listing pages (OF8), it will search one page and
  must say so.
- Select all now depends on the filter, so the same click selects different documents depending on
  what was typed.

**Blindspots & missed edge cases**
- The filter matches what a cell's title says, so `true`, `false` or `item` match every row with a
  boolean or a count, and the folding of diacritics lets `cafe` match `Café`, wider than an exact
  search.
- A collection whose fields are all hidden shows only ids, which identify nothing to a reader.
- A selection made before filtering keeps documents the filter hides, and Delete deletes them too;
  the question counts them, but does not say they are hidden.
- A reference shows an id, which identifies nothing to a reader until references resolve to labels.
- Widths are in rem and fractions, so a very wide screen still leaves long values cut while short
  columns have room to spare.
- Right-to-left text and very long unbroken words rely on the browser's ellipsis.
