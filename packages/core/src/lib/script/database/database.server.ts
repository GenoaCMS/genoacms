import { building } from '$app/environment'
import type { CollectionReference } from '@genoacms/contracts/database'
import type { DirectoryContents } from '@genoacms/contracts/storage'
import { defaultBucketId, fullyQualifiedNameToFilename, getObjectJSON, listOrCreateDirectory } from '../storage/storage.server'
import {
  getCollections,
  createDocument,
  getCollection,
  getDocument,
  updateDocument,
  deleteDocument
} from './providers.server'

const collectionsDirectory = '.genoacms/collections'
/** Nothing is listed, and nothing created, while SvelteKit analyses the build (architecture D8). */
const noContents: DirectoryContents = { files: [], directories: [] }
const collectionsDirectoryContents = building
  ? noContents
  : await listOrCreateDirectory({ name: collectionsDirectory, bucket: defaultBucketId })
const predefinedCollections = getCollections() || []

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
  } catch {}
  const filtered = predefinedCollections.filter(obj => obj.name === name)
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
