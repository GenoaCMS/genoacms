import { redirect } from '@sveltejs/kit'
import { deleteUserDocument, getUserCollectionReference, getUserDocument } from '$lib/script/database/user.server'
import { requireAuthContext } from '$lib/script/authorization/request.server'
import type { PageServerLoad, RequestEvent } from './$types'

export const load: PageServerLoad = async ({ params, locals }) => {
  const ctx = requireAuthContext(locals)
  const { collectionName, documentId } = params
  const collection = await getUserCollectionReference(ctx, collectionName)
  const document = await getUserDocument(ctx, { collection, id: documentId })
  return {
    document
  }
}

async function deleteDoc ({ params, locals }: RequestEvent) {
  const ctx = requireAuthContext(locals)
  const { collectionName, documentId } = params

  // Reading the collection needs read; removing the document needs delete. Both are checked.
  const collectionReference = await getUserCollectionReference(ctx, collectionName)
  const documentReference = { collection: collectionReference, id: documentId }

  await deleteUserDocument(ctx, documentReference)
  redirect(307, '.')
}

export const actions = {
  delete: deleteDoc
}
