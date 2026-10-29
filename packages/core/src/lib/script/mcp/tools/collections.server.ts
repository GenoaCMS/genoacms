import type { AuthContext } from '$lib/script/authorization/context'
import { DocumentNotFoundError } from '$lib/script/database/errors'
import {
  createUserDocument,
  deleteUserDocument,
  getUserCollection,
  getUserCollectionReference,
  getUserCollectionReferences,
  getUserDocument,
  updateUserDocument
} from '$lib/script/database/user.server'

type Args = Record<string, unknown>
type Where = NonNullable<Parameters<typeof getUserCollection>[2]>['where']

const DEFAULT_PAGE_SIZE = 50

async function referenceOf (ctx: AuthContext, collection: string) {
  try {
    return await getUserCollectionReference(ctx, collection)
  } catch (error) {
    if (error instanceof Error && error.message === 'collection/not-found') throw new Error('collection/not-found: ' + collection)
    throw error
  }
}

/** TOL-18 */
async function listCollections (ctx: AuthContext) {
  return getUserCollectionReferences(ctx).map(name => ({ name }))
}

/** TOL-18 */
async function getCollection (ctx: AuthContext, { collection }: Args) {
  const { name, primaryKey, schema } = await referenceOf(ctx, collection as string)
  return { name, primaryKey, schema }
}

/** TOL-19 */
async function listDocuments (ctx: AuthContext, { collection, where, limit, pageToken }: Args) {
  const reference = await referenceOf(ctx, collection as string)
  const page = await getUserCollection(ctx, reference, {
    where: where as Where,
    limit: (limit as number | undefined) ?? DEFAULT_PAGE_SIZE,
    pageToken: pageToken as string | undefined
  })
  const documents = page.documents.map(snapshot => ({ id: snapshot.reference.id, data: snapshot.data }))
  return page.next === undefined ? { documents } : { documents, next: page.next }
}

/** TOL-20 */
async function getDocument (ctx: AuthContext, { collection, id }: Args) {
  const reference = await referenceOf(ctx, collection as string)
  const snapshot = await getUserDocument(ctx, { collection: reference, id: id as string })
  if (snapshot === undefined) throw new DocumentNotFoundError(reference.name, id as string)
  return { id: snapshot.reference.id, data: snapshot.data }
}

/** TOL-21 */
async function createDocument (ctx: AuthContext, { collection, data }: Args) {
  const reference = await referenceOf(ctx, collection as string)
  const snapshot = await createUserDocument(ctx, reference, data as Record<string, never>)
  return { id: snapshot.reference.id }
}

/** TOL-22 */
async function updateDocument (ctx: AuthContext, { collection, id, data }: Args) {
  const reference = await referenceOf(ctx, collection as string)
  await updateUserDocument(ctx, { collection: reference, id: id as string }, data as Record<string, never>)
  return { id }
}

/** TOL-23 */
async function deleteDocument (ctx: AuthContext, { collection, id }: Args) {
  const reference = await referenceOf(ctx, collection as string)
  await deleteUserDocument(ctx, { collection: reference, id: id as string })
  return {}
}

export { listCollections, getCollection, listDocuments, getDocument, createDocument, updateDocument, deleteDocument }
