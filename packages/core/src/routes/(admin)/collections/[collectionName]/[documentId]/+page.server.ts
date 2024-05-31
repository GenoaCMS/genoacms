import { fail } from '@sveltejs/kit'
import { getCollectionReference, getDocument, updateDocument } from '$lib/script/database/database.server'
import { validateDocumentData } from '$lib/script/database/validators'
import { parseDocument } from '$lib/script/collections/collections.server'

export async function load ({ params }) {
  const { collectionName, documentId } = params
  const collection = await getCollectionReference(collectionName)
  const document = await getDocument({ collection, id: documentId })
  return {
    document
  }
}

const update = async ({ params, request }) => {
  const { collectionName, documentId } = params
  const collection = await getCollectionReference(collectionName)
  const formData = await request.formData()

  const documentData = parseDocument(formData, collection.schema)

  const areDocumentDataValid = validateDocumentData(collection.schema, documentData)

  if (!areDocumentDataValid) return fail(1)
  await updateDocument({ collection, id: documentId }, documentData)
}

function deleteDocument ({ params }) {
  const { collectionName, documentId } = params
  log
}

export const actions = {
  update,
  delete: deleteDocument
}
