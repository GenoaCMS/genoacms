import { suite, it, expect } from 'vitest'
import config from '../dist/config.js'

const { createDocument, deleteDocument, getCollection, getDocument, updateDocument } = await config.database.adapter

const testCollection = config.collections[0]
const testDocuments = config.testDocuments

suite('complex test', async () => {
  let id
  let documentData = testDocuments[0]
  /**
   * @type {import('@genoacms/cloudabstraction').database.DocumentReference}
   */
  const documentReference = {
    collection: testCollection,
    id
  }

  it('is creating a document', async () => {
    /**
     * @type {import('@genoacms/cloudabstraction').database.DocumentSnapshot}
     */
    const documentSnap = await createDocument(testCollection, documentData)
    id = documentSnap[testCollection.primaryKey]
    /**
     * @type {import('@genoacms/cloudabstraction').database.DocumentSnapshot}
     */
    const expectedDocumentSnap = {
      reference: documentReference,
      data: documentData
    }
    expect(documentSnap).toMatchObject(expectedDocumentSnap)
  })

  it('is getting a document', async () => {
    /**
     * @type {import('@genoacms/cloudabstraction').database.DocumentSnapshot}
     */
    const documentSnap = await getDocument(documentReference)
    /**
     * @type {import('@genoacms/cloudabstraction').database.DocumentSnapshot}
     */
    const expectedDocumentSnap = {
      reference: documentReference,
      data: documentData
    }
    expect(documentSnap).toMatchObject(expectedDocumentSnap)
  })

  documentData = testDocuments[1]

  it('is updating a document', async () => {
    /**
     * @type {import('@genoacms/cloudabstraction').database.UpdateSnapshot}
     */
    const updateSnap = await updateDocument(documentReference, documentData)
    /**
     * @type {import('@genoacms/cloudabstraction').database.UpdateSnapshot}
     */
    const expectedUpdateSnap = {
      reference: documentReference,
      data: documentData
    }
    expect(updateSnap).toMatchObject(expectedUpdateSnap)
  })

  it('is getting a document again', async () => {
    /**
     * @type {import('@genoacms/cloudabstraction').database.DocumentSnapshot}
     */
    const documentSnap = await getDocument({
      collection: testCollection,
      id
    })
    /**
     * @type {import('@genoacms/cloudabstraction').database.DocumentSnapshot}
     */
    const expectedDocumentSnap = {
      reference: documentReference,
      data: documentData
    }
    expect(documentSnap).toMatchObject(expectedDocumentSnap)
  })

  it('is deleting a document', async () => {
    const doc = await deleteDocument(documentReference, documentData)
    expect(doc).toBeUndefined()
  })

  it('lists collection', async () => {
    /**
     * @type {import('@genoacms/cloudabstraction').database.CollectionSnapshot}
     */
    const collectionSnap = await getCollection(testCollection)
    expect(collectionSnap).toBeInstanceOf(Array)
    // const docs = collectionSnap.map(doc => doc.data)
    // expect(collection.length).toBeGreaterThan(1)
  })
})
