import { describe, it, expectTypeOf } from 'vitest'
import type { CollectionReference } from '@genoacms/contracts/database'

const primaryKey = { key: 'id', schema: { type: 'string' } }
const schema = { type: 'object', properties: { body: { type: 'string' } } }

describe('CollectionReference', () => {
  it('DATA-1: a reference may carry a uiSchema keyed by field', () => {
    const reference: CollectionReference = { name: 'posts', primaryKey, schema, uiSchema: { body: { showPreview: false } } }
    expectTypeOf(reference).toExtend<CollectionReference>()
  })

  it('DATA-1: a reference without uiSchema is still a reference', () => {
    const reference: CollectionReference = { name: 'posts', primaryKey, schema }
    expectTypeOf(reference).toExtend<CollectionReference>()
  })

  it('DATA-1: showPreview is a boolean', () => {
    // @ts-expect-error showPreview is a boolean
    const reference: CollectionReference = { name: 'posts', primaryKey, schema, uiSchema: { body: { showPreview: 'no' } } }
    expectTypeOf(reference).toExtend<CollectionReference>()
  })
})
