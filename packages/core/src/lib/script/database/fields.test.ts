import { describe, it, expect } from 'vitest'
import type { CollectionReference } from '@genoacms/contracts/database'
import { collectionFields } from './fields'

const collection = (schema: CollectionReference['schema']): CollectionReference =>
  ({ name: 'articles', primaryKey: { key: 'id', schema: { type: 'string' } }, schema })

describe('the fields of a collection', () => {
  it('COL-4: are the keys of schema.properties, in declared order', () => {
    const schema = { type: 'object', properties: { title: { type: 'string' }, body: { type: 'string' }, author: { type: 'string' } } }
    expect(collectionFields(collection(schema))).toEqual(['title', 'body', 'author'])
  })

  it('COL-4: are none for a schema without properties', () => {
    expect(collectionFields(collection({ type: 'object' }))).toEqual([])
  })
})
