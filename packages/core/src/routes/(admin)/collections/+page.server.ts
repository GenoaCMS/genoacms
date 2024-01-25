import { getCollectionReferences } from '$lib/script/database'

export const load = async () => {
  const collectionReferences = await getCollectionReferences()
  return {
    collectionReferences
  }
}
