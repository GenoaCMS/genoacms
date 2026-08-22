import type {
  DirectoryContents,
  ObjectReference,
  ObjectPayload,
  UploadOptions
} from '@genoacms/cloudabstraction/storage'
import { hasAnyPermissionOn, requirePermission } from '$lib/script/authorization/enforce'
import type { AuthContext } from '$lib/script/authorization/context'
import {
  getBucketReferences,
  uploadObject,
  moveObject,
  deleteObject,
  listDirectory,
  createDirectory,
  moveDirectory,
  deleteDirectory,
  processDirectoryContents
} from './storage.server'

/**
 * Storage operations performed **by a user**, as opposed to by the CMS.
 *
 * `storage.server` is the primary service and stays unprivileged: the CMS reads and writes its own
 * `.genoacms/` state through it, during bootstrap, before any principal exists. Gating it would make
 * a copywriter need bucket-write to save a page, and would make starting a fresh instance
 * impossible.
 *
 * This module is the layer in front of it for operations a user actually performed — browsing a
 * bucket, uploading a file, deleting one. Every export takes an `AuthContext` as its first parameter
 * and checks a permission before delegating, so omitting the context is a *type error* and
 * the check lives with the operation rather than at the route.
 *
 * **Naming.** Each function is its primary counterpart with `User` in the name — `getObject` becomes
 * `getUserObject`. The two can then be imported side by side without aliasing, and a reader can tell
 * at the call site which layer is being used.
 *
 * Permissions are bucket-scoped, so the resource is always the bucket name:
 * - `storage:bucket:read` — listing directories and decorating a listing with signed URLs. There is
 *   no gated read of object *contents* here because no call site needs one: the browser fetches
 *   objects directly from the signed URLs. A feature that needs a server-side read must add the
 *   wrapper rather than reach for the primary `getObject`, which is unprivileged
 * - `storage:bucket:write` — uploading, creating directories, and **moves**, which relocate rather
 *   than remove
 * - `storage:bucket:delete` — deleting objects and directories
 */

const requireRead = (ctx: AuthContext, bucket: string): void =>
  requirePermission(ctx, 'storage:bucket:read', bucket)
const requireWrite = (ctx: AuthContext, bucket: string): void =>
  requirePermission(ctx, 'storage:bucket:write', bucket)
const requireDelete = (ctx: AuthContext, bucket: string): void =>
  requirePermission(ctx, 'storage:bucket:delete', bucket)

/**
 * The buckets this principal holds some grant on, not every bucket configured.
 *
 * There is no `storage:bucket:list` permission — it was removed as redundant — so this filters
 * rather than denies. Navigation then offers only what the user could actually act on, instead of
 * listing names that lead to a denial.
 *
 * **Any bucket-scoped grant, not `read` alone.** A principal holding only
 * `storage:bucket:write` must still see the bucket as an upload target; filtering on `read` would
 * hide the destination of an upload they are permitted to perform.
 */
const getUserBucketReferences = (ctx: AuthContext) =>
  getBucketReferences().filter(bucket => hasAnyPermissionOn(ctx, 'bucket', bucket.name))

const uploadUserObject = async (
  ctx: AuthContext,
  reference: ObjectReference,
  data: ObjectPayload,
  options?: UploadOptions
) => {
  requireWrite(ctx, reference.bucket)
  return await uploadObject(reference, data, options)
}

/** A move relocates rather than removes, so it needs write rather than delete. */
const moveUserObject = async (ctx: AuthContext, reference: ObjectReference, newPath: string) => {
  requireWrite(ctx, reference.bucket)
  return await moveObject(reference, newPath)
}

const deleteUserObject = async (ctx: AuthContext, reference: ObjectReference) => {
  requireDelete(ctx, reference.bucket)
  return await deleteObject(reference)
}

const listUserDirectory = async (ctx: AuthContext, reference: ObjectReference) => {
  requireRead(ctx, reference.bucket)
  return await listDirectory(reference)
}

const createUserDirectory = async (ctx: AuthContext, reference: ObjectReference) => {
  requireWrite(ctx, reference.bucket)
  return await createDirectory(reference)
}

const moveUserDirectory = async (ctx: AuthContext, reference: ObjectReference, newPath: string) => {
  requireWrite(ctx, reference.bucket)
  return await moveDirectory(reference, newPath)
}

const deleteUserDirectory = async (ctx: AuthContext, reference: ObjectReference) => {
  requireDelete(ctx, reference.bucket)
  return await deleteDirectory(reference)
}

/**
 * Decorates directory contents with filenames and signed URLs.
 *
 * The read check is on the bucket, once, rather than per file: a signed URL is minted here for every
 * listed object, so the permission that matters is the one covering the listing.
 */
const processUserDirectoryContents = async (
  ctx: AuthContext,
  bucketId: string,
  contents: DirectoryContents
) => {
  requireRead(ctx, bucketId)
  return await processDirectoryContents(bucketId, contents)
}

export {
  getUserBucketReferences,
  uploadUserObject,
  moveUserObject,
  deleteUserObject,
  listUserDirectory,
  createUserDirectory,
  moveUserDirectory,
  deleteUserDirectory,
  processUserDirectoryContents
}
