import { fail, redirect } from '@sveltejs/kit'
import { deleteDocument, getCollectionReference, getDocument, updateDocument } from '$lib/script/database/database.server'
import { superValidate } from 'sveltekit-superforms'
import { schemasafe } from 'sveltekit-superforms/adapters'
import { formats } from '$lib/script/database/validators'

export async function load ({ params }) {
  const { collectionName, documentId } = params
  const collection = await getCollectionReference(collectionName)
  const document = await getDocument({ collection, id: documentId })
  const validator = schemasafe(collection.schema, { config: { formats } })
  const form = await superValidate(document.data, validator)
  return {
    document,
    form
  }
}

const update = async ({ params, request }) => {
  const { collectionName, documentId } = params
  const collection = await getCollectionReference(collectionName)
  const validator = schemasafe(collection.schema, { config: { formats } })
  const form = await superValidate(request, validator)

  if (!form.valid) return fail(1)
  const documentData = form.data
  await updateDocument({ collection, id: documentId }, documentData)
}

async function deleteDoc ({ params }) {
  const { collectionName, documentId } = params

  const collectionReference = await getCollectionReference(collectionName)
  const documentReference = { collection: collectionReference, id: documentId }

  await deleteDocument(documentReference)
  redirect(307, '.')
}

export const actions = {
  update,
  delete: deleteDoc
}
