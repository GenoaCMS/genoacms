import { getCollectionReferences } from '$lib/script/database.server'

export const load = async () => {
  const collectionReferences = await getCollectionReferences()
  return {
    collectionReferences
  }
}
