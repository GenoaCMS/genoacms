import { describe, it, expect } from 'vitest'
import type { CollectionReference } from '@genoacms/contracts/database'
import { extractDocumentProperties } from './utils'

const collection = (schema: CollectionReference['schema']): CollectionReference =>
  ({ name: 'articles', primaryKey: { key: 'id', schema: { type: 'string' } }, schema })

const names = (reference: CollectionReference): string[] =>
  extractDocumentProperties(reference).map(property => property.name)

describe('the fields the listing and the editor show', () => {
  it('COL-4: are the keys of schema.properties, in declared order', () => {
    const schema = { type: 'object', properties: { title: { type: 'string' }, body: { type: 'string' }, author: { type: 'string' } } }
    expect(names(collection(schema))).toEqual(['title', 'body', 'author'])
  })

  it('COL-4: are none for a schema without properties', () => {
    expect(names(collection({ type: 'object' }))).toEqual([])
  })
})
