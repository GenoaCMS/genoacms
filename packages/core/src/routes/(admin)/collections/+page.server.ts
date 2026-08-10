import { getCollectionReferences } from '$lib/script/database/database.server'

export async function load () {
  const collectionReferences = getCollectionReferences()
  return {
    collectionReferences
  }
}
