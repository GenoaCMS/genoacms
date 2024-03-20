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

function getCollectionReferences () {
  return collectionsDirectoryContents.files.map(file => {
    return fullyQualifiedNameToFilename(file.name)
  })
}
async function getCollectionReference (name: string): Promise<CollectionReference> {
  const collectionSchema = await getObjectJSON({ name: `${collectionsDirectory}/${name}`, bucket: defaultBucketId })
  return collectionSchema
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
