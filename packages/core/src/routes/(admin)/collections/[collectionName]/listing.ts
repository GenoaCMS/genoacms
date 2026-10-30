import type { CollectionReference } from '@genoacms/contracts/database'
import { lexer, type Token } from 'marked'
import { asSchemaObject } from '#lib/script/schema.js'
import { fieldKindOf, type FieldKind } from './Editor/fieldKind'

interface Column {
  name: string
  kind: FieldKind
  isLead: boolean
  isDocumentId: boolean
}

type CellLook = 'text' | 'mono' | 'number' | 'check' | 'muted'

interface Cell {
  text: string
  title: string
  look: CellLook
  isEmpty: boolean
}

const LEAD_KINDS: ReadonlySet<FieldKind> = new Set(['string', 'text', 'markdown'])
const COUNT_KINDS: ReadonlySet<FieldKind> = new Set(['list', 'references', 'files'])
const NARROW_KINDS: ReadonlySet<FieldKind> = new Set(['boolean', 'number', ...COUNT_KINDS])
const COMPACT_KINDS: ReadonlySet<FieldKind> = new Set(['uuid', 'reference', 'enum', 'const', 'file'])
const MONO_KINDS: ReadonlySet<FieldKind> = new Set(['uuid', 'reference'])

const EMPTY_CELL: Cell = { text: '—', title: 'empty', look: 'muted', isEmpty: true }
const DOCUMENT_ID_COLUMN: Column = { name: 'id', kind: 'string', isLead: true, isDocumentId: true }

// OF6
const uiSchemaOf = (reference: CollectionReference): Record<string, { showPreview?: boolean }> =>
  (reference as CollectionReference & { uiSchema?: Record<string, { showPreview?: boolean }> }).uiSchema ?? {}

// LST-1
function columnsOf (reference: CollectionReference): Column[] {
  const properties = reference.schema.properties ?? {}
  const uiSchema = uiSchemaOf(reference)
  const columns = Object.keys(properties)
    .filter(name => uiSchema[name]?.showPreview !== false)
    .map(name => ({ name, kind: fieldKindOf(asSchemaObject(properties[name]) ?? {}), isLead: false, isDocumentId: false }))
  if (columns.length === 0) return [DOCUMENT_ID_COLUMN]
  const leadIndex = columns.findIndex(column => LEAD_KINDS.has(column.kind))
  if (leadIndex === -1) return columns
  const lead = { ...columns[leadIndex], isLead: true }
  return [lead, ...columns.filter((_, index) => index !== leadIndex)]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isBlank = (text: string): boolean => text.trim() === ''

const isScalar = (value: unknown): value is string | number | boolean =>
  (typeof value === 'string' && !isBlank(value)) || typeof value === 'number' || typeof value === 'boolean'

const textCell = (text: string, look: CellLook = 'text'): Cell =>
  isBlank(text) ? EMPTY_CELL : { text, title: text, look, isEmpty: false }

const countCell = (count: number): Cell =>
  ({ text: String(count), title: `${count} item${count === 1 ? '' : 's'}`, look: 'number', isEmpty: false })

const booleanCell = (value: boolean): Cell =>
  value ? { text: '', title: 'true', look: 'check', isEmpty: false } : { text: '–', title: 'false', look: 'muted', isEmpty: false }

const objectSummary = (value: Record<string, unknown>): string =>
  Object.entries(value)
    .filter(([, field]) => isScalar(field))
    .map(([key, field]) => `${key}: ${String(field)}`)
    .join(' · ')

const fileName = (value: Record<string, unknown>): string =>
  typeof value.name === 'string' ? value.name.slice(value.name.lastIndexOf('/') + 1) : ''

// LST-8
function cellOf (kind: FieldKind, value: unknown): Cell {
  if (value === undefined || value === null) return EMPTY_CELL
  if (COUNT_KINDS.has(kind)) return Array.isArray(value) ? countCell(value.length) : EMPTY_CELL
  if (kind === 'boolean') return typeof value === 'boolean' ? booleanCell(value) : EMPTY_CELL
  if (kind === 'number') return typeof value === 'number' ? textCell(String(value), 'number') : EMPTY_CELL
  if (kind === 'file') return isRecord(value) ? textCell(fileName(value)) : EMPTY_CELL
  if (kind === 'object') return isRecord(value) ? textCell(objectSummary(value)) : EMPTY_CELL
  if (kind === 'markdown') return typeof value === 'string' ? textCell(plainMarkdown(value)) : EMPTY_CELL
  if (kind === 'unsupported' || kind === 'const' || kind === 'enum') return isScalar(value) ? textCell(String(value)) : EMPTY_CELL
  return typeof value === 'string' ? textCell(value, MONO_KINDS.has(kind) ? 'mono' : 'text') : EMPTY_CELL
}

// LST-1, LST-8
function cellsOf (columns: Column[], id: string, data: Record<string, unknown>): Cell[] {
  return columns.map(column => column.isDocumentId ? cellOf('string', id) : cellOf(column.kind, data[column.name]))
}

const SKIPPED_TOKENS: ReadonlySet<string> = new Set(['html', 'space', 'hr', 'def'])

const ENTITIES: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ' }

function decodeEntities (text: string): string {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (entity: string, name: string) => {
    if (name.startsWith('#x') || name.startsWith('#X')) return String.fromCodePoint(parseInt(name.slice(2), 16))
    if (name.startsWith('#')) return String.fromCodePoint(parseInt(name.slice(1), 10))
    return ENTITIES[name.toLowerCase()] ?? entity
  })
}

const hasTokens = (token: Token): token is Token & { tokens: Token[] } =>
  'tokens' in token && Array.isArray(token.tokens)

function inlineText (tokens: Token[]): string {
  return tokens.map(token => {
    if (token.type === 'br') return ' '
    if (SKIPPED_TOKENS.has(token.type)) return ''
    if (token.type !== 'image' && hasTokens(token) && token.tokens.length > 0) return inlineText(token.tokens)
    return 'text' in token && typeof token.text === 'string' ? token.text : ''
  }).join('')
}

function blockTexts (token: Token): string[] {
  if (SKIPPED_TOKENS.has(token.type)) return []
  if (token.type === 'list') return (token.items as Token[]).flatMap(blockTexts)
  if (token.type === 'list_item' || token.type === 'blockquote') return (token.tokens as Token[]).flatMap(blockTexts)
  if (token.type === 'table') {
    const cells = [...token.header, ...token.rows.flat()] as Array<{ tokens: Token[] }>
    return cells.map(cell => inlineText(cell.tokens))
  }
  return [inlineText([token])]
}

function plainMarkdown (source: string): string {
  return decodeEntities(lexer(source).flatMap(blockTexts).join(' ')).replace(/\s+/g, ' ').trim()
}

const LABEL_REM_PER_CHARACTER = 0.5
const CELL_PADDING_REM = 1.5
const NARROW_MIN_REM = 5.5
const NARROW_MAX_REM = 8
const labelWidth = (label: string): number => Math.ceil((label.length * LABEL_REM_PER_CHARACTER + CELL_PADDING_REM) * 2) / 2

const isEndAligned = (column: Column): boolean => column.kind === 'number' || COUNT_KINDS.has(column.kind)

function widthOf (column: Column): { template: string, minimum: number } {
  if (column.isLead) return { template: 'minmax(12rem, 3fr)', minimum: 12 }
  if (NARROW_KINDS.has(column.kind)) {
    const width = Math.min(NARROW_MAX_REM, Math.max(NARROW_MIN_REM, labelWidth(column.name)))
    return { template: `${width}rem`, minimum: width }
  }
  if (COMPACT_KINDS.has(column.kind)) return { template: 'minmax(7rem, 1fr)', minimum: 7 }
  return { template: 'minmax(8rem, 2fr)', minimum: 8 }
}

const gridTemplate = (columns: Column[]): string => columns.map(column => widthOf(column).template).join(' ')

const minimumWidth = (columns: Column[]): string =>
  `${columns.reduce((sum, column) => sum + widthOf(column).minimum, 0)}rem`

const folded = (text: string): string => text.normalize('NFD').replace(/\p{M}/gu, '').toUpperCase()

// LST-7
function matchesFilter (id: string, cells: Cell[], query: string): boolean {
  const needle = folded(query.trim())
  if (needle === '') return true
  const haystacks = [id, ...cells.filter(cell => !cell.isEmpty).map(cell => cell.title)]
  return haystacks.some(haystack => folded(haystack).includes(needle))
}

/** The filter a collection opens with: always empty, so it is recomputed whenever the collection changes. LST-7 */
const openingFilter = (_collection: string): string => ''

const documents = (count: number): string => `${count} document${count === 1 ? '' : 's'}`

function documentCount (shown: number, total: number, isFiltering: boolean): string {
  return isFiltering ? `${shown} of ${documents(total)}` : documents(total)
}

export { columnsOf, cellOf, cellsOf, plainMarkdown, gridTemplate, minimumWidth, isEndAligned, matchesFilter, openingFilter, documentCount }
export type { Column, Cell, CellLook }
