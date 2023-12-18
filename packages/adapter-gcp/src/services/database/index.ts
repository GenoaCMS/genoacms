import { Firestore } from '@google-cloud/firestore'
import config from '../../config.js'
import type { database as databaseT } from '@genoacms/cloudabstraction'

const firestore = new Firestore({
  credentials: config.database.credentials,
  databaseId: config.database.databaseId,
  projectId: config.database.projectId
})

const getDocument: databaseT.getDocument = async ({ collection, id }) => {
  const document = await firestore.collection(collection.name).doc(id).get()
  return document.data() as any
}

export {
  getDocument
}
