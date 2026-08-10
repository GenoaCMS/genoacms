import { describe, it, expect } from 'vitest'
import { asSchemaObject, isNullable } from './schema'

describe('asSchemaObject', () => {
  it('passes an object schema through', () => {
    const schema = { type: 'string' as const }
    expect(asSchemaObject(schema)).toBe(schema)
  })

  it.each([true, false])('rejects the boolean schema %s', (schema) => {
    // JSON Schema allows `true`/`false` as a whole schema; the CMS never uses them
    expect(asSchemaObject(schema)).toBeUndefined()
  })

  it('rejects a tuple, which `items` may legally be', () => {
    expect(asSchemaObject([{ type: 'string' }, { type: 'number' }])).toBeUndefined()
  })

  it('rejects undefined', () => {
    expect(asSchemaObject(undefined)).toBeUndefined()
  })
})

describe('isNullable', () => {
  it('is true when null is among the listed types', () => {
    expect(isNullable({ type: ['string', 'null'] })).toBe(true)
  })

  it('is true for a bare null type', () => {
    expect(isNullable({ type: 'null' })).toBe(true)
  })

  it('is false for a single non-null type', () => {
    expect(isNullable({ type: 'string' })).toBe(false)
  })

  it('is false when the type list omits null', () => {
    expect(isNullable({ type: ['string', 'number'] })).toBe(false)
  })

  it('is false when no type is declared at all', () => {
    expect(isNullable({})).toBe(false)
  })

  // `nullable: true` is OpenAPI 3.0, not JSON Schema. @exodus/schemasafe has no
  // such keyword and silently ignores it, so it must not be treated as nullable.
  it('ignores an OpenAPI-style nullable keyword', () => {
    expect(isNullable({ type: 'string', nullable: true } as never)).toBe(false)
  })
})
