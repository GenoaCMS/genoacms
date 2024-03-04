import { getCollectionReferences } from '$lib/script/database/database.server'

export const load = async () => {
  const collectionReferences = await getCollectionReferences()
  return {
    collectionReferences
  }
}
