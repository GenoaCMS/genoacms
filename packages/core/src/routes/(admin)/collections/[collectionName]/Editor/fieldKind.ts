import { asSchemaObject, type SchemaObject } from '$lib/script/schema'
import type { InputValue } from '$lib/components/editors/types'

type FieldKind =
  | 'reference'
  | 'uuid'
  | 'text'
  | 'markdown'
  | 'enum'
  | 'string'
  | 'number'
  | 'boolean'
  | 'references'
  | 'files'
  | 'file'
  | 'list'
  | 'object'
  | 'const'
  | 'unsupported'

const LABELLABLE_KINDS: ReadonlySet<FieldKind> = new Set(['uuid', 'text', 'string', 'number', 'boolean'])
const COMPACT_KINDS: ReadonlySet<FieldKind> = new Set(['uuid', 'enum', 'string', 'number', 'boolean', 'reference', 'file'])

function fieldKindOf (schema: SchemaObject): FieldKind {
  const items = asSchemaObject(schema.items)
  if (schema.title === 'reference') return 'reference'
  if (schema.type === 'string' && schema.format === 'uuid') return 'uuid'
  if (schema.type === 'string' && schema.format === 'text') return 'text'
  if (schema.type === 'string' && schema.format === 'markdown') return 'markdown'
  if (Array.isArray(schema.enum)) return 'enum'
  if (schema.type === 'string') return 'string'
  if (schema.type === 'number') return 'number'
  if (schema.type === 'boolean') return 'boolean'
  if (schema.type === 'array' && items?.title === 'reference') return 'references'
  if (schema.type === 'array' && items?.title === 'storageResource') return 'files'
  if (schema.title === 'storageResource') return 'file'
  if (schema.type === 'array') return 'list'
  if (schema.type === 'object') return 'object'
  if (schema.const !== undefined) return 'const'
  return 'unsupported'
}

const isLabellable = (kind: FieldKind): boolean => LABELLABLE_KINDS.has(kind)

const isCompact = (kind: FieldKind): boolean => COMPACT_KINDS.has(kind)

const isHidden = (kind: FieldKind): boolean => kind === 'const' || kind === 'unsupported'

const countOf = (value: InputValue): number => Array.isArray(value) ? value.length : 0

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`

function limitedCount (count: number, maxItems: number | undefined, noun: string): string {
  if (!maxItems) return plural(count, noun)
  return `${count} of ${plural(maxItems, noun)}`
}

function fieldHint (kind: FieldKind, schema: SchemaObject, value: InputValue): string {
  const items = asSchemaObject(schema.items)
  switch (kind) {
    case 'reference': return `→ ${schema.description ?? 'document'}`
    case 'references': return `${limitedCount(countOf(value), schema.maxItems, 'document')} · ${items?.description ?? ''}`
    case 'files': return limitedCount(countOf(value), schema.maxItems, 'file')
    case 'file': return 'file'
    case 'list': return limitedCount(countOf(value), schema.maxItems, 'item')
    case 'uuid': return 'UUID'
    case 'text': return 'long text'
    case 'markdown': return 'markdown'
    case 'enum': return 'choice'
    case 'number': return 'number'
    default: return ''
  }
}

export {
  fieldKindOf,
  fieldHint,
  isLabellable,
  isCompact,
  isHidden
}
export type { FieldKind }
