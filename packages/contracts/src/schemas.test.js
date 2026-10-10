import { describe, it, expect } from 'vitest'
import { storageResource, nullableStorageResource, reference } from './schemas.js'

const storageResourceShape = {
  type: 'object',
  title: 'storageResource',
  properties: { bucket: { type: 'string' }, name: { type: 'string' } }
}

describe('schema helpers', () => {
  it('COL-5: storageResource is an object of bucket and name titled storageResource', () => {
    expect(storageResource).toStrictEqual(storageResourceShape)
  })

  it('COL-5: nullableStorageResource is storageResource or null, titled storageResource', () => {
    expect(nullableStorageResource).toStrictEqual({
      title: 'storageResource',
      oneOf: [storageResourceShape, { type: 'null' }]
    })
  })

  it('COL-5: reference is a string titled reference, its collection in the description', () => {
    expect(reference({ collection: 'authors' })).toStrictEqual({
      type: 'string',
      title: 'reference',
      description: 'authors'
    })
  })

  it('COL-5: reference carries the given type and format', () => {
    expect(reference({ type: 'number', format: 'int', collection: 'authors' })).toStrictEqual({
      type: 'number',
      title: 'reference',
      description: 'authors',
      format: 'int'
    })
  })
})
