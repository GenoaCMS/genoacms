import { getCollectionReference, getCollection } from '$lib/script/database/database.server'

export async function load({ params }) {
  const collectionName = params.collectionName
  const collectionReference = await getCollectionReference(collectionName)
  const documents = await getCollection(collectionReference)
  return {
    collectionReference,
    documents
  }
}


