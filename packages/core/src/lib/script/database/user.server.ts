import { hasAnyPermissionOn, requirePermission } from '$lib/script/authorization/enforce'
import {
  permittedFields,
  projectDocument,
  mergeDocument,
  writableDocument
} from '$lib/script/authorization/fields'
import type { AuthContext } from '$lib/script/authorization/context'
import { WILDCARD } from '$lib/script/authorization/grants'
import {
  getCollectionReferences,
  getCollectionReference,
  getCollection,
  getDocument,
  createDocument,
  updateDocument,
  deleteDocument
} from './database.server'
import { DocumentNotFoundError } from './errors'
import { validateDocument } from './validation'

/**
 * Database operations performed **by a user**.
 *
 * `database.server` is the primary service and stays unprivileged, matching the storage split: the
 * CMS lists collection definitions from `.genoacms/databases/<database>/collections/` at module
 * scope, before any request exists and so before any principal does.
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
 * **any** collection-scoped grant, matching the bucket catalog — a principal who may write a
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

const requireReadableConditions = (
  ctx: AuthContext,
  collection: string,
  queryParams: Parameters<typeof getCollection>[1]
): void => {
  const fields = readable(ctx, collection)
  if (fields === WILDCARD) return
  const unreadable = queryParams?.where?.find(({ field }) => !fields.includes(field))
  if (unreadable !== undefined) throw new Error('documents/unreadable-field: ' + unreadable.field)
}

const getUserCollection = async (
  ctx: AuthContext,
  reference: CollectionRef,
  queryParams?: Parameters<typeof getCollection>[1]
) => {
  requireRead(ctx, reference.name)
  requireReadableConditions(ctx, reference.name, queryParams)

  const page = await getCollection(reference, queryParams)
  const fields = readable(ctx, reference.name)
  return {
    ...page,
    documents: page.documents.map(snapshot => ({
      ...snapshot,
      data: projectDocument(snapshot.data, fields)
    }))
  }
}

const getUserDocument = async (ctx: AuthContext, reference: DocumentRef) => {
  requireRead(ctx, reference.collection.name)

  const snapshot = await getDocument(reference)
  if (snapshot === undefined) return snapshot

  return { ...snapshot, data: projectDocument(snapshot.data, readable(ctx, reference.collection.name)) }
}

const withoutRequiredKey = (reference: CollectionRef) => {
  const schema = reference.schema as { required?: string[] }
  if (schema.required === undefined) return reference.schema
  return { ...schema, required: schema.required.filter(key => key !== reference.primaryKey.key) } as typeof reference.schema
}

const createUserDocument = async (
  ctx: AuthContext,
  reference: CollectionRef,
  document: Parameters<typeof createDocument>[1]
) => {
  requireWrite(ctx, reference.name)

  validateDocument(withoutRequiredKey(reference), document)

  // Nothing is stored yet, so a field the principal may not write is not theirs to set.
  const permitted = writableDocument(document, writable(ctx, reference.name))
  return await createDocument(reference, permitted as typeof document)
}

const withoutKey = (reference: DocumentRef, data: Record<string, unknown>): Record<string, unknown> => {
  return Object.fromEntries(Object.entries(data).filter(([field]) => field !== reference.collection.primaryKey?.key))
}

const storedAfterUpdate = (
  stored: Record<string, unknown>,
  document: Record<string, unknown>,
  fields: ReturnType<typeof writable>
) => fields === WILDCARD ? { ...stored, ...document } : mergeDocument(stored, document, fields)

const updateUserDocument = async (
  ctx: AuthContext,
  reference: DocumentRef,
  document: Parameters<typeof updateDocument>[1]
) => {
  requireWrite(ctx, reference.collection.name)

  // The stored record is read here and never returned: the values of unwritable fields are
  // preserved, not disclosed.
  const current = await getDocument(reference)
  if (current === undefined) throw new DocumentNotFoundError(reference.collection.name, reference.id)

  const fields = writable(ctx, reference.collection.name)
  const stored = storedAfterUpdate(current.data, document, fields)
  validateDocument(reference.collection.schema, withoutKey(reference, stored))

  return await updateDocument(reference, (fields === WILDCARD ? document : stored) as typeof document)
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
