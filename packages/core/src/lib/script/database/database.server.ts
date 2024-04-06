import { config } from '@genoacms/cloudabstraction'
import type { CollectionReference } from '@genoacms/cloudabstraction/database'
import { defaultBucketId, fullyQualifiedNameToFilename, getObjectJSON, listOrCreateDirectory } from '../storage/storage.server'

const {
  createDocument,
  getCollection,
  getDocument,
  updateDocument,
  deleteDocument
} = await config.database.adapter

const collectionsDirectory = '.genoacms/collections'
const collectionsDirectoryContents = await listOrCreateDirectory({ name: collectionsDirectory, bucket: defaultBucketId })
const predefinedCollections = config.database.collections || []

function getCollectionReferences () {
  const predefinedReferences = predefinedCollections.map(collection => collection.name)
  const dynamicReferences = collectionsDirectoryContents.files.map(file => {
    return fullyQualifiedNameToFilename(file.name)
  })
  return [...predefinedReferences, ...dynamicReferences]
}
async function getCollectionReference (name: string): Promise<CollectionReference> {
  try {
    return await getObjectJSON({ name: `${collectionsDirectory}/${name}`, bucket: defaultBucketId })
  } catch (error) {}
  const filtered = predefinedCollections.filter(obj => obj.name === name)
  console.log(filtered)
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
