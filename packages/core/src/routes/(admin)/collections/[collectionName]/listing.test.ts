import { describe, it, expect } from 'vitest'
import type { CollectionReference } from '@genoacms/contracts/database'
import { columnsOf, cellOf, cellsOf, gridTemplate, minimumWidth, matchesFilter, documentCount } from './listing'

const collectionOf = (properties: Record<string, unknown>, uiSchema?: Record<string, { showPreview?: boolean }>): CollectionReference =>
  ({ name: 'articles', primaryKey: { key: 'id', schema: { type: 'string' } }, schema: { type: 'object', properties }, uiSchema }) as CollectionReference

const empty = { text: '—', title: 'empty', look: 'muted', isEmpty: true }

describe('columns', () => {
  it('LST-1: the lead field comes first, the others keep the schema\'s order, hidden fields have no column', () => {
    const columns = columnsOf(collectionOf({
      id: { type: 'string', format: 'uuid' },
      count: { type: 'number' },
      title: { type: 'string' },
      body: { type: 'string', format: 'markdown' },
      secret: { type: 'string' }
    }, { secret: { showPreview: false } }))

    expect(columns.map(column => column.name)).toEqual(['title', 'id', 'count', 'body'])
    expect(columns.filter(column => column.isLead).map(column => column.name)).toEqual(['title'])
  })

  it('LST-1: without a text-like field no column leads', () => {
    const columns = columnsOf(collectionOf({ id: { type: 'string', format: 'uuid' }, count: { type: 'number' } }))

    expect(columns.map(column => column.name)).toEqual(['id', 'count'])
    expect(columns.some(column => column.isLead)).toBe(false)
  })

  it('LST-1: a collection with no column shows each document\'s id', () => {
    const columns = columnsOf(collectionOf({ secret: { type: 'string' } }, { secret: { showPreview: false } }))

    expect(columns.map(column => [column.name, column.isLead, column.isDocumentId])).toEqual([['id', true, true]])
    expect(cellsOf(columns, 'doc-7', { secret: 'x' })).toEqual([cellOf('string', 'doc-7')])
  })

  it('LST-1: a narrow column is at most 8rem, however long its name', () => {
    const columns = columnsOf(collectionOf({ ['isAVeryLongBooleanFieldNameIndeed']: { type: 'boolean' } }))

    expect(gridTemplate(columns)).toBe('8rem')
  })

  it('LST-1: short kinds get narrow columns', () => {
    const columns = columnsOf(collectionOf({ title: { type: 'string' }, done: { type: 'boolean' }, note: { type: 'string' } }))

    expect(gridTemplate(columns)).toBe('minmax(12rem, 3fr) 5.5rem minmax(8rem, 2fr)')
    expect(minimumWidth(columns)).toBe('25.5rem')
  })
})

describe('cells', () => {
  it('LST-8: each kind shows its value', () => {
    expect(cellOf('string', 'abc')).toEqual({ text: 'abc', title: 'abc', look: 'text', isEmpty: false })
    expect(cellOf('text', 'long')).toEqual({ text: 'long', title: 'long', look: 'text', isEmpty: false })
    expect(cellOf('enum', 'draft')).toEqual({ text: 'draft', title: 'draft', look: 'text', isEmpty: false })
    expect(cellOf('const', 'article')).toEqual({ text: 'article', title: 'article', look: 'text', isEmpty: false })
    expect(cellOf('uuid', 'a1b2')).toEqual({ text: 'a1b2', title: 'a1b2', look: 'mono', isEmpty: false })
    expect(cellOf('reference', 'doc-7')).toEqual({ text: 'doc-7', title: 'doc-7', look: 'mono', isEmpty: false })
    expect(cellOf('number', 3)).toEqual({ text: '3', title: '3', look: 'number', isEmpty: false })
    expect(cellOf('boolean', true)).toEqual({ text: '', title: 'true', look: 'check', isEmpty: false })
    expect(cellOf('boolean', false)).toEqual({ text: '–', title: 'false', look: 'muted', isEmpty: false })
    expect(cellOf('list', [1, 2])).toEqual({ text: '2', title: '2 items', look: 'number', isEmpty: false })
    expect(cellOf('references', ['a'])).toEqual({ text: '1', title: '1 item', look: 'number', isEmpty: false })
    expect(cellOf('files', [])).toEqual({ text: '0', title: '0 items', look: 'number', isEmpty: false })
    expect(cellOf('file', { bucket: 'b', name: 'e2e/cover.png' })).toEqual({ text: 'cover.png', title: 'cover.png', look: 'text', isEmpty: false })
    expect(cellOf('object', { minutes: 3, tags: [], seo: {}, slug: 'x', empty: '' }))
      .toEqual({ text: 'minutes: 3 · slug: x', title: 'minutes: 3 · slug: x', look: 'text', isEmpty: false })
    expect(cellOf('markdown', '# Head\n\nSome *text*.')).toEqual({ text: 'Head Some text.', title: 'Head Some text.', look: 'text', isEmpty: false })
    expect(cellOf('unsupported', 7)).toEqual({ text: '7', title: '7', look: 'text', isEmpty: false })
  })

  it('LST-8: markdown reads as rendered text, entities decoded, blocks, items, cells and breaks spaced', () => {
    expect(cellOf('markdown', 'A & B, 5 < 6, "q" \'s\' and `x & y` and Tom &amp; Jerry').text).toBe('A & B, 5 < 6, "q" \'s\' and x & y and Tom & Jerry')
    expect(cellOf('markdown', '| a | b |\n| - | - |\n| 1 | 2 |').text).toBe('a b 1 2')
    expect(cellOf('markdown', '- one\n- two\n  - nested').text).toBe('one two nested')
    expect(cellOf('markdown', 'line one  \nline two').text).toBe('line one line two')
    expect(cellOf('markdown', '> quoted\n\n[link](https://x) ![alt](i.png)').text).toBe('quoted link alt')
  })

  it('LST-8: absent, null, empty and misshapen values show an empty cell', () => {
    expect(cellOf('string', undefined)).toEqual(empty)
    expect(cellOf('string', null)).toEqual(empty)
    expect(cellOf('string', '')).toEqual(empty)
    expect(cellOf('number', 'x')).toEqual(empty)
    expect(cellOf('list', {})).toEqual(empty)
    expect(cellOf('object', 7)).toEqual(empty)
    expect(cellOf('object', { tags: [] })).toEqual(empty)
    expect(cellOf('file', 'cover.png')).toEqual(empty)
    expect(cellOf('unsupported', { a: 1 })).toEqual(empty)
    expect(cellOf('string', '   ')).toEqual(empty)
    expect(cellOf('object', { a: '  ', b: 1 }).text).toBe('b: 1')
  })
})

describe('the filter', () => {
  it('LST-7: the filter matches the id or a cell\'s title, trimmed and ignoring case', () => {
    const cells = [cellOf('string', 'Hello World'), cellOf('list', [1, 2]), cellOf('string', '')]

    for (const query of ['  world ', '2 ITEMS', 'Doc-1', '', '  ']) expect(matchesFilter('doc-1', cells, query)).toBe(true)
    for (const query of ['empty', 'nothing']) expect(matchesFilter('doc-1', cells, query)).toBe(false)
  })

  it('LST-7: the filter ignores diacritics and folds case beyond ASCII', () => {
    const cells = [cellOf('string', 'İstanbul'), cellOf('string', 'Straße'), cellOf('string', 'Příliš žluťoučký kůň')]

    for (const query of ['istanbul', 'STRASSE', 'zlutoucky', 'KŮŇ']) expect(matchesFilter('doc-1', cells, query)).toBe(true)
  })

  it('LST-1, LST-7: the count reads documents, or shown of documents while filtering', () => {
    expect(documentCount(1, 1, false)).toBe('1 document')
    expect(documentCount(5, 5, false)).toBe('5 documents')
    expect(documentCount(2, 5, true)).toBe('2 of 5 documents')
  })
})
