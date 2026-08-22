import { getUserCollectionReference, getUserCollection, deleteUserDocument } from '$lib/script/database/user.server'
import { requireAuthContext } from '$lib/script/authorization/request.server'
import { isString } from '$lib/script/utils'
import { fail } from '@sveltejs/kit'
// From the route's own generated types rather than from `@sveltejs/kit`: the generic `Actions`
// widens the params to every route's, which then disagrees with this route's `RequestEvent`.
import type { Actions, RequestEvent } from './$types'

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

/**
 * Deletes every selected document.
 *
 * The ids come from the listing's selection as one JSON field, mirroring the storage browser's bulk
 * deletion. **Nothing is trusted about them beyond their being ids**: each is turned into a
 * reference on the collection named in the route, so a submitted id cannot address a document
 * elsewhere, and each deletion runs the same `db:collection:delete` check a single deletion runs.
 *
 * Unlike deleting from a document's own page, this does not redirect — the listing is already the
 * screen the user is on, and the client refreshes it.
 */
async function deleteDocuments ({ params, request, locals }: RequestEvent) {
  const ctx = requireAuthContext(locals)
  const data = await request.formData()
  const documentsString = data.get('documents')
  if (!isString(documentsString)) return fail(400, { reason: 'missing-documents' })

  // The selection carries numeric ids too, for collections keyed by a number. A document is
  // addressed by a string either way, which is what the reference asks for.
  const ids = (JSON.parse(documentsString) as Array<string | number>).map(String)
  // Reading the collection needs read; removing each document needs delete. Both are checked.
  const collection = await getUserCollectionReference(ctx, params.collectionName)

  await Promise.all(ids.map(id => deleteUserDocument(ctx, { collection, id })))
}

export const actions = {
  delete: deleteDocuments
} satisfies Actions
