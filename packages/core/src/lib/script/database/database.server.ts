import { config } from '@genoacms/cloudabstraction'

const {
  createDocument,
  getCollection,
  getDocument,
  updateDocument,
  deleteDocument
} = await config.database.adapter
const getCollectionReferences = () => {
  return config.collections
}
const getCollectionReference = (name: string) => {
  const filtered = config.collections.filter(obj => obj.name === name)
  if (filtered.length === 0) throw new Error('collection/not-found')
  return filtered[0]
}

export {
  getCollectionReferences,
  getCollectionReference,
  createDocument,
  getCollection,
  getDocument,
  updateDocument,
  deleteDocument
}
