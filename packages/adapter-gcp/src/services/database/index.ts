import type {
  Adapter,
  DatabaseProvider,
  CollectionSnapshot,
  Document,
  DocumentReference,
  DocumentSnapshot,
  UpdateSnapshot
} from '@genoacms/cloudabstraction/database'
import config from '../../config.js'
import { Firestore } from '@google-cloud/firestore'

const PROVIDER_NAME = '@genoacms/adapter-gcp/database'
const firestoreConfig = config.database.providers.find((provider: DatabaseProvider) => provider.name === PROVIDER_NAME)
if (!firestoreConfig) throw new Error('firestore-provider-not-found')
const firestore = new Firestore({
  credentials: firestoreConfig.credentials,
  databaseId: firestoreConfig.databaseId,
  projectId: firestoreConfig.projectId
})

const createDocument: Adapter['createDocument'] = async (reference, data) => {
  const document = await firestore.collection(reference.name).add(data)
  const documentReference: DocumentReference<typeof reference> = {
    collection: reference,
    id: document.id
  }
  return {
    reference: documentReference,
    data
  } satisfies DocumentSnapshot<typeof reference>
}

const getCollection: Adapter['getCollection'] = async (reference) => {
  const collection = await firestore.collection(reference.name).get()
  const documents: CollectionSnapshot<typeof reference> = []

  collection.forEach(document => {
    const documentData: Document<typeof reference.schema> = {}
    Object.keys(reference.schema.properties).forEach(key => {
      documentData[key] = document.get(key)
    })

    documents.push({
      reference: {
        collection: reference,
        id: document.id
      },
      data: document.data() as Document<typeof reference.schema>
    })
  })
  return documents
}

const getDocument: Adapter['getDocument'] = async ({ collection, id }) => {
  const document = await firestore.collection(collection.name).doc(id).get()
  if (!document.exists) return undefined
  const documentReference: DocumentReference<typeof collection> = {
    collection,
    id
  }
  const documentSnapshot: DocumentSnapshot<typeof collection> = {
    reference: documentReference,
    data: document.data() as Document<typeof collection>
  }
  return documentSnapshot
}

const updateDocument: Adapter['updateDocument'] = async (reference, document) => {
  await firestore.collection(reference.collection.name).doc(reference.id).update(document)
  return {
    reference,
    data: document
  } satisfies UpdateSnapshot<typeof reference.collection>
}

const deleteDocument: Adapter['deleteDocument'] = async (reference) => {
  await firestore.collection(reference.collection.name).doc(reference.id).delete()
}

export {
  createDocument,
  getDocument,
  getCollection,
  updateDocument,
  deleteDocument
}
