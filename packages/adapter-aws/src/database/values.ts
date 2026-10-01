import type { AttributeValue } from '@aws-sdk/client-dynamodb'

export type Item = Record<string, AttributeValue>

const unsupported = (path: string): Error => new Error(`database/unsupported-value: ${path}`)

const childPath = (path: string, key: string | number): string => path === '' ? String(key) : `${path}.${key}`

const isPlainObject = (value: object): boolean => {
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

// DDB-3
export function toItem (document: Record<string, unknown>, path = ''): Item {
  const item: Item = {}
  for (const [key, value] of Object.entries(document)) {
    if (value !== undefined) item[key] = toAttribute(value, childPath(path, key))
  }
  return item
}

// DDB-3
export function toAttribute (value: unknown, path: string): AttributeValue {
  if (typeof value === 'string') return { S: value }
  if (typeof value === 'boolean') return { BOOL: value }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw unsupported(path)
    return { N: String(value) }
  }
  if (value === null) return { NULL: true }
  if (Array.isArray(value)) return { L: value.map((element, index) => toAttribute(element, childPath(path, index))) }
  if (typeof value === 'object' && isPlainObject(value)) return { M: toItem(value as Record<string, unknown>, path) }
  throw unsupported(path)
}

// DDB-3
export function fromItem (item: Item): Record<string, unknown> {
  const document: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(item)) document[key] = fromAttribute(value)
  return document
}

// DDB-3
export function fromAttribute (value: AttributeValue): unknown {
  if (value.S !== undefined) return value.S
  if (value.N !== undefined) return Number(value.N)
  if (value.BOOL !== undefined) return value.BOOL
  if (value.NULL !== undefined) return null
  if (value.L !== undefined) return value.L.map(fromAttribute)
  if (value.M !== undefined) return fromItem(value.M)
  throw new Error(`database/unsupported-value: ${Object.keys(value).join(',')}`)
}
