import { hasAnyPermissionOn, requirePermission } from '$lib/script/authorization/enforce'
import {
  permittedFields,
  projectDocument,
  mergeDocument,
  writableDocument
} from '$lib/script/authorization/fields'
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
 * A `read` or `write` grant may additionally name **which fields** of the collection it covers, and
 * that restriction is applied here:
 *
 * - **Reads project after fetching.** Not every adapter supports server-side field selection, so
 *   unreadable fields are stripped in this layer, uniformly, before a document leaves it.
 * - **Writes merge against the stored record**, never replace it. A principal who cannot write a
 *   field must not be able to erase it by submitting a record without it — the omission is the
 *   absence of permission, not an instruction to clear the value.
 *
 * A principal whose grants name no fields is unrestricted, so masking changes nothing for anyone who
 * was not restricted in the first place. The rules themselves live in `authorization/fields`, pure
 * and tested without a database.
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
 * The collections this principal holds some grant on, not every collection configured.
 *
 * Filters rather than denies, for the same reason the bucket list does: navigation should offer
 * only what the user could actually act on, rather than names that lead to a denial. Filtered on
 * **any** collection-scoped grant, matching the bucket catalogue — a principal who may write a
 * collection but not read it must still see where their writes go.
 */
const getUserCollectionReferences = (ctx: AuthContext): string[] =>
  getCollectionReferences().filter(name => hasAnyPermissionOn(ctx, 'collection', name))

const getUserCollectionReference = async (ctx: AuthContext, name: string) => {
  requireRead(ctx, name)
  return await getCollectionReference(name)
}

/** The fields this principal may read, or write, on one collection. */
const readable = (ctx: AuthContext, collection: string) =>
  permittedFields(ctx, 'db:collection:read', collection)
const writable = (ctx: AuthContext, collection: string) =>
  permittedFields(ctx, 'db:collection:write', collection)

const getUserCollection = async (
  ctx: AuthContext,
  reference: CollectionRef,
  queryParams?: Parameters<typeof getCollection>[1]
) => {
  requireRead(ctx, reference.name)

  const snapshots = await getCollection(reference, queryParams)
  const fields = readable(ctx, reference.name)
  return snapshots.map(snapshot => ({
    ...snapshot,
    data: projectDocument(snapshot.data, fields)
  }))
}

const getUserDocument = async (ctx: AuthContext, reference: DocumentRef) => {
  requireRead(ctx, reference.collection.name)

  const snapshot = await getDocument(reference)
  if (snapshot === undefined) return snapshot

  return { ...snapshot, data: projectDocument(snapshot.data, readable(ctx, reference.collection.name)) }
}

const createUserDocument = async (
  ctx: AuthContext,
  reference: CollectionRef,
  document: Parameters<typeof createDocument>[1]
) => {
  requireWrite(ctx, reference.name)

  // Nothing is stored yet, so a field the principal may not write is not theirs to set.
  const permitted = writableDocument(document, writable(ctx, reference.name))
  return await createDocument(reference, permitted as typeof document)
}

const updateUserDocument = async (
  ctx: AuthContext,
  reference: DocumentRef,
  document: Parameters<typeof updateDocument>[1]
) => {
  requireWrite(ctx, reference.collection.name)

  const fields = writable(ctx, reference.collection.name)
  if (fields === '*') return await updateDocument(reference, document)

  // Restricted writes need the stored record to merge against. It is read here and never returned:
  // the values of unwritable fields are preserved, not disclosed.
  const current = await getDocument(reference)
  const merged = current === undefined
    ? writableDocument(document, fields)
    : mergeDocument(current.data, document, fields)

  return await updateDocument(reference, merged as typeof document)
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
