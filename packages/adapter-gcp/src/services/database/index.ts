import { Firestore } from '@google-cloud/firestore'
import config from '../../config.js'
import type { database as databaseT } from '@genoacms/cloudabstraction'

const firestore = new Firestore({
  credentials: config.database.credentials,
  databaseId: config.database.databaseId,
  projectId: config.database.projectId
})

const createDocument: databaseT.createDocument = async (reference, data ) => {
  const document = await firestore.collection(reference.name).add(data)
  return {
    collection: reference,
    id: document.id
  }
}

const getCollection: databaseT.getCollection = async ({ name, schema }) => {
  const collection = await firestore.collection(name).get()
  const documents: databaseT.Document<typeof schema>[] = []
  collection.forEach(document => {
    let documentData: databaseT.Document<typeof schema> = {}
    Object.keys(schema.properties).forEach(key => {
      documentData[key] = document.get(key)
    })

    documents.push(document.data())
  })
  return documents
}

const getDocument: databaseT.getDocument = async ({ collection, id }) => {
  const document = await firestore.collection(collection.name).doc(id).get()
  return document.data() as any
}

const updateDocument: databaseT.updateDocument = async (reference, document) => {
  await firestore.collection(reference.collection.name).doc(reference.id).update(document)
  return reference
}

const deleteDocument: databaseT.deleteDocument = async (reference) => {
  await firestore.collection(reference.collection.name).doc(reference.id).delete()
}

export {
  createDocument,
  getDocument,
  getCollection,
  updateDocument,
  deleteDocument
}
