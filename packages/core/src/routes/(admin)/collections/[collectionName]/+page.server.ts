import { getUserCollectionReference, getUserCollection } from '$lib/script/database/user.server'
import { requireAuthContext } from '$lib/script/authorization/request.server'

export async function load ({ params, locals }) {
  const ctx = requireAuthContext(locals)
  const collectionName = params.collectionName
  const collectionReference = await getUserCollectionReference(ctx, collectionName)
  const documents = await getUserCollection(ctx, collectionReference)
  return {
    collectionReference,
    documents
  }
}
