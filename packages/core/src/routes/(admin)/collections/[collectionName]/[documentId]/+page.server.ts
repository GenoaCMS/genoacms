import { redirect } from '@sveltejs/kit'
import { deleteDocument, getCollectionReference, getDocument } from '$lib/script/database/database.server'
import type { PageServerLoad } from './$types'

export const load: PageServerLoad = async ({ params }) => {
  const { collectionName, documentId } = params
  const collection = await getCollectionReference(collectionName)
  const document = await getDocument({ collection, id: documentId })
  return {
    document
  }
}

async function deleteDoc ({ params }: { params: any }) {
  const { collectionName, documentId } = params

  const collectionReference = await getCollectionReference(collectionName)
  const documentReference = { collection: collectionReference, id: documentId }

  await deleteDocument(documentReference)
  redirect(307, '.')
}

export const actions = {
  delete: deleteDoc
}
