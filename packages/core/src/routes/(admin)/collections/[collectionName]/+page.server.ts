import { getCollectionReference, getCollection, createDocument } from '$lib/script/database/database.server'
import { parseDocument } from '$lib/script/collections/collections.server'

export async function load ({ params }) {
  const collectionName = params.collectionName
  const collectionReference = await getCollectionReference(collectionName)
  const documents = await getCollection(collectionReference)
  return {
    collectionReference,
    documents
  }
}

export const actions = {
  createDocument: async function ({ locals, params, request }) {
    if (!locals.user) return
    if (!params.collectionName) return

    const collectionReference = await getCollectionReference(params.collectionName)

    const data = await request.formData()
    const document = parseDocument(data, collectionReference.schema)
    createDocument(collectionReference, document)
  }
}
