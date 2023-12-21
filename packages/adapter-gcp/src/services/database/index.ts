import { Firestore } from '@google-cloud/firestore'
import config from '../../config.js'
import type { database as databaseT } from '@genoacms/cloudabstraction'

const firestore = new Firestore({
  credentials: config.database.credentials,
  databaseId: config.database.databaseId,
  projectId: config.database.projectId
})

const createDocument: databaseT.createDocument = async (reference, data) => {
  const document = await firestore.collection(reference.name).add(data)
  const documentReference: databaseT.DocumentReference<typeof reference> = {
    collection: reference,
    id: document.id
  }
  return {
    reference: documentReference,
    data
  } satisfies databaseT.DocumentSnapshot<typeof reference>
}

const getCollection: databaseT.getCollection = async (reference) => {
  const collection = await firestore.collection(reference.name).get()
  const documents: databaseT.CollectionSnapshot<typeof reference> = []

  collection.forEach(document => {
    const documentData: databaseT.Document<typeof reference.schema> = {}
    Object.keys(reference.schema.properties).forEach(key => {
      documentData[key] = document.get(key)
    })

    documents.push({
      reference: {
        collection: reference,
        id: document.id
      },
      data: document.data() as databaseT.Document<typeof reference.schema>
    })
  })
  return documents
}

const getDocument: databaseT.getDocument = async ({ collection, id }) => {
  const document = await firestore.collection(collection.name).doc(id).get()
  if (!document.exists) return undefined
  const documentReference: databaseT.DocumentReference<typeof collection> = {
    collection,
    id
  }
  const documentSnapshot: databaseT.DocumentSnapshot<typeof collection> = {
    reference: documentReference,
    data: document.data() as databaseT.Document<typeof collection>
  }
  return documentSnapshot
}

const updateDocument: databaseT.updateDocument = async (reference, document) => {
  await firestore.collection(reference.collection.name).doc(reference.id).update(document)
  return {
    reference,
    data: document
  } satisfies databaseT.UpdateSnapshot<typeof reference.collection>
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
