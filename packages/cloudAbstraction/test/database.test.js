import { suite, it, expect } from 'vitest'
import config from '../dist/config.js'

const { createDocument, deleteDocument, getCollection, getDocument, updateDocument } = await config.database.adapter

const testCollection = config.collections[0]
const testDocuments = config.testDocuments

suite('complex test', async () => {
  let id
  let documentData = testDocuments[0]

  it('is creating a document', async () => {
    const doc = await createDocument(testCollection, documentData)
    id = doc[testCollection.primaryKey]
    expect(doc).toMatchObject({
      collection: testCollection
    })
  })

  it('is getting a document', async () => {
    const doc = await getDocument({
      collection: testCollection,
      id
    })
    expect(doc).toEqual(documentData)
  })

  documentData = testDocuments[1]

  it('is updating a document', async () => {
    const documentReference = {
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
    const documentReference = {
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
