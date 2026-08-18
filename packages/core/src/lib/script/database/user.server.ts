import { hasPermission, requirePermission } from '$lib/script/authorization/enforce'
import type { AuthContext } from '$lib/script/authorization/context'
import {
  getCollectionReferences,
  getCollectionReference,
  getCollection,
  getDocument,
  createDocument,
  updateDocument,
  deleteDocument
} from './database.server'

/**
 * Database operations performed **by a user**.
 *
 * `database.server` is the primary service and stays unprivileged, matching the storage split: the
 * CMS resolves collection definitions from `.genoacms/collections` at module scope, before any
 * request exists and so before any principal does.
 *
 * Every export here takes an `AuthContext` first and checks a permission before delegating, so
 * omitting the context is a *type error* and the check lives with the operation rather than
 * at the route. Each function is its primary counterpart with `User` in the name, so the two layers
 * are imported side by side without aliasing.
 *
 * Permissions are **collection-scoped**, so the resource is the collection name:
 * - `db:collection:read` — listing collections, reading a collection or a document
 * - `db:collection:write` — creating and updating documents
 * - `db:collection:delete` — deleting documents
 *
 * `db:collection:schema` governs changing a collection's shape. No service function here does that
 * yet, so it is deliberately unused rather than approximated by `write`.
 */

type CollectionRef = Parameters<typeof getCollection>[0]
type DocumentRef = Parameters<typeof getDocument>[0]

const requireRead = (ctx: AuthContext, collection: string): void =>
  requirePermission(ctx, 'db:collection:read', collection)
const requireWrite = (ctx: AuthContext, collection: string): void =>
  requirePermission(ctx, 'db:collection:write', collection)
const requireDelete = (ctx: AuthContext, collection: string): void =>
  requirePermission(ctx, 'db:collection:delete', collection)

/**
 * The collections this principal may read, not every collection configured.
 *
 * Filters rather than denies, for the same reason the bucket list does: navigation should offer
 * only what the user could actually open, rather than names that lead to a denial.
 */
const getUserCollectionReferences = (ctx: AuthContext): string[] =>
  getCollectionReferences().filter(name => hasPermission(ctx, 'db:collection:read', name))

const getUserCollectionReference = async (ctx: AuthContext, name: string) => {
  requireRead(ctx, name)
  return await getCollectionReference(name)
}

const getUserCollection = async (
  ctx: AuthContext,
  reference: CollectionRef,
  queryParams?: Parameters<typeof getCollection>[1]
) => {
  requireRead(ctx, reference.name)
  return await getCollection(reference, queryParams)
}

const getUserDocument = async (ctx: AuthContext, reference: DocumentRef) => {
  requireRead(ctx, reference.collection.name)
  return await getDocument(reference)
}

const createUserDocument = async (
  ctx: AuthContext,
  reference: CollectionRef,
  document: Parameters<typeof createDocument>[1]
) => {
  requireWrite(ctx, reference.name)
  return await createDocument(reference, document)
}

const updateUserDocument = async (
  ctx: AuthContext,
  reference: DocumentRef,
  document: Parameters<typeof updateDocument>[1]
) => {
  requireWrite(ctx, reference.collection.name)
  return await updateDocument(reference, document)
}

const deleteUserDocument = async (ctx: AuthContext, reference: DocumentRef) => {
  requireDelete(ctx, reference.collection.name)
  return await deleteDocument(reference)
}

export {
  getUserCollectionReferences,
  getUserCollectionReference,
  getUserCollection,
  getUserDocument,
  createUserDocument,
  updateUserDocument,
  deleteUserDocument
}
