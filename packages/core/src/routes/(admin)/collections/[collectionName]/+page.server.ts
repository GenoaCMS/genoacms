import { getCollectionReference, getCollection } from '$lib/script/database'

export const load = async ({ params}) => {
  const collectionName = params.collectionName
  const collectionReference = await getCollectionReference(collectionName)
  const documents = await getCollection(collectionReference)
  return {
    collectionReference,
    documents
  }
}
