import {
  createDocument,
  deleteDocument,
  getCollection,
  getDocument,
  updateDocument
} from '../dist/services/database/index.js'
import { suite, test, it, expect } from 'vitest'

const testCollection = {
  name: 'test',
  schema: {
    type: 'object',
    properties: {
      name: {
        type: 'string'
      },
      isA: {
        type: 'boolean'
      }
    }
  }
}

suite('complex test', async () => {
  let id
  let documentData = { name: 'createDocument', isA: true }
  it('is creating a document', async () => {
    const doc = await createDocument(testCollection, documentData)
    expect(doc).toMatchObject({
      collection: testCollection
    })
    id = doc.id
  })
  it('is getting a document', async () => {
    const doc = await getDocument({
      collection: testCollection,
      id
    })
    expect(doc).toEqual(documentData)
  })
  documentData = { name: 'updateDocument', isA: false }
  it('is updating a document', async () => {
    let documentReference = {
      collection: testCollection,
      id
    }
    const doc = await updateDocument(documentReference, documentData)
    expect(doc).toBe(documentReference)
  })
  it('is getting a document again', async () => {
    const doc = await getDocument({
      collection: testCollection,
      id
    })
    expect(doc).toEqual(documentData)
  })
  it('is deleting a document', async () => {
    let documentReference = {
      collection: testCollection,
      id
    }
    const doc = await deleteDocument(documentReference, documentData)
    expect(doc).toBeUndefined()
  })
  it('lists collection', async () => {
    const collection = await getCollection(testCollection)
    expect(collection).toBeInstanceOf(Array)
    expect(collection.length).toBeGreaterThan(1)
  })
})

