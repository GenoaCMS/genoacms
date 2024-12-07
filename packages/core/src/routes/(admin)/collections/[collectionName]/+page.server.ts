import { getCollectionReference, getCollection, createDocument } from '$lib/script/database/database.server'
import { message, superValidate } from 'sveltekit-superforms'
import { schemasafe } from 'sveltekit-superforms/adapters'
import { formats } from '$lib/script/database/validators'

export async function load ({ params }) {
  const collectionName = params.collectionName
  const collectionReference = await getCollectionReference(collectionName)
  const documents = await getCollection(collectionReference)
  const validator = schemasafe(collectionReference.schema, { config: { formats } })
  const form = await superValidate({}, validator)
  return {
    collectionReference,
    documents,
    form
  }
}

export const actions = {
  createDocument: async function ({ locals, params, request }) {
    if (!locals.user) return
    if (!params.collectionName) return

    const collectionReference = await getCollectionReference(params.collectionName)
    const validator = schemasafe(collectionReference.schema, { config: { formats } })
    const form = await superValidate(request, validator)

    if (!form.valid) return message(form, { status: 'fail', text: 'Failed to create a document' })
    createDocument(collectionReference, form.data)
    return message(form, { status: 'success', text: 'Document created' })
  }
}
