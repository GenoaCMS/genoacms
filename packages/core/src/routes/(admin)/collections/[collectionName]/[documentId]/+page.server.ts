import { fail } from '@sveltejs/kit'
import { getCollectionReference, getDocument, updateDocument } from '$lib/script/database/database.server'
import { validateDocumentData } from '$lib/script/database/validators'

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
  const collection = getCollectionReference(collectionName)
  const formData = await request.formData()
  const documentData = {}
  for (const property in collection.schema.properties) {
    const type = collection.schema.properties[property].type
    let value = formData.get(property)
    if (type === 'number') value = Number(value)
    else if (type === 'boolean') value = Boolean(value)
    documentData[property] = value
  }

  const areDocumentDataValid = validateDocumentData(collection.schema, documentData)

  if (!areDocumentDataValid) return fail(1)
  await updateDocument({ collection, id: documentId }, documentData)
}

export const actions = {
  update
}
