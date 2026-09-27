import { suite, it, expect } from 'vitest'

/**
 * Registers the database conformance suite with vitest.
 *
 * @param {import('@genoacms/contracts/database').Adapter} adapter
 * @param {{
 *   collection: import('@genoacms/contracts/database').CollectionReference,
 *   testDocuments: [import('@genoacms/contracts/database').Document, import('@genoacms/contracts/database').Document]
 * }} fixture
 */
function runDatabaseConformance (adapter, { collection, testDocuments }) {
  suite('database conformance', async () => {
    let documentData = testDocuments[0]
    /**
     * @type {import('@genoacms/contracts/database').DocumentReference}
     */
    let documentReference

    it('is creating a document', async () => {
      /**
       * @type {import('@genoacms/contracts/database').DocumentSnapshot}
       */
      const documentSnap = await adapter.createDocument(collection, documentData)
      documentReference = documentSnap.reference
      /**
       * @type {import('@genoacms/contracts/database').DocumentSnapshot}
       */
      const expectedDocumentSnap = {
        reference: documentReference,
        data: documentData
      }
      expect(documentSnap).toMatchObject(expectedDocumentSnap)
    })

    it('is getting a document', async () => {
      /**
       * @type {import('@genoacms/contracts/database').DocumentSnapshot}
       */
      const documentSnap = await adapter.getDocument(documentReference)
      /**
       * @type {import('@genoacms/contracts/database').DocumentSnapshot}
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
       * @type {import('@genoacms/contracts/database').UpdateSnapshot}
       */
      const updateSnap = await adapter.updateDocument(documentReference, documentData)
      /**
       * @type {import('@genoacms/contracts/database').UpdateSnapshot}
       */
      const expectedUpdateSnap = {
        reference: documentReference,
        data: documentData
      }
      expect(updateSnap).toMatchObject(expectedUpdateSnap)
    })

    it('is getting a document again', async () => {
      /**
       * @type {import('@genoacms/contracts/database').DocumentSnapshot}
       */
      const documentSnap = await adapter.getDocument(documentReference)
      /**
       * @type {import('@genoacms/contracts/database').DocumentSnapshot}
       */
      const expectedDocumentSnap = {
        reference: documentReference,
        data: documentData
      }
      expect(documentSnap).toMatchObject(expectedDocumentSnap)
    })

    it('is deleting a document', async () => {
      const doc = await adapter.deleteDocument(documentReference, documentData)
      expect(doc).toBeUndefined()
    })

    it('lists collection', async () => {
      /**
       * @type {import('@genoacms/contracts/database').CollectionSnapshot}
       */
      const collectionSnap = await adapter.getCollection(collection)
      expect(collectionSnap).toBeInstanceOf(Array)
      // const docs = collectionSnap.map(doc => doc.data)
      // expect(collection.length).toBeGreaterThan(1)
    })
  })
}

export { runDatabaseConformance }
