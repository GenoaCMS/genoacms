import type {
  DirectoryContents,
  DirectoryListingParams,
  ObjectReference,
  ObjectPayload,
  UploadOptions
} from '@genoacms/contracts/storage'
import { hasAnyPermissionOn, requirePermission } from '#lib/script/authorization/enforce.js'
import type { AuthContext } from '#lib/script/authorization/context.js'
import {
  defaultBucketId,
  getBucketReferences,
  uploadObject,
  moveObject,
  deleteObject,
  listDirectory,
  createDirectory,
  moveDirectory,
  deleteDirectory,
  processDirectoryContents,
  getSignedURL
} from './storage.server'
import { isDirectoryReference } from './browserPaths'

// BD1, BD2, BD4, STS-2, STS-3, STS-5

const INTERNAL_STATE = '.genoacms/'
const INTERNAL_STATE_NAME = '.genoacms'

/** Raised when a user operation would change the CMS's own state (STS-5). */
class InternalReadOnlyError extends Error {
  readonly reference: ObjectReference

  constructor (reference: ObjectReference) {
    super(`storage/internal-read-only: ${reference.name}`)
    this.name = 'InternalReadOnlyError'
    this.reference = reference
  }
}

type UserPermission = 'read' | 'write' | 'delete'

const requireOn = (ctx: AuthContext, permission: UserPermission, bucket: string): void =>
  requirePermission(ctx, `storage:bucket:${permission}`, bucket)

// STS-5
const isInternalState = ({ bucket, name }: ObjectReference): boolean =>
  bucket === defaultBucketId &&
  (name.startsWith(INTERNAL_STATE) || name === INTERNAL_STATE_NAME || (isDirectoryReference(name) && INTERNAL_STATE.startsWith(name)) || name === '')

// STS-5
const requireWritable = (...references: ObjectReference[]): void => {
  const internal = references.find(isInternalState)
  if (internal !== undefined) throw new InternalReadOnlyError(internal)
}

const requireChange = (ctx: AuthContext, permission: UserPermission, ...references: ObjectReference[]): void => {
  for (const reference of references) requireOn(ctx, permission, reference.bucket)
  requireWritable(...references)
}

const destinationOf = (reference: ObjectReference, name: string): ObjectReference => ({ bucket: reference.bucket, name })

// STS-1, BD3
const getUserBucketReferences = (ctx: AuthContext) =>
  getBucketReferences().filter(bucket => hasAnyPermissionOn(ctx, 'bucket', bucket.name))

/** Checks every reference as a write would, the permission first, before any is written (BRW-16). */
const requireUserWrites = (ctx: AuthContext, references: ObjectReference[]): void =>
  requireChange(ctx, 'write', ...references)

/** Checks every reference as a delete would, the permission first, before any is deleted (BRW-16). */
const requireUserDeletes = (ctx: AuthContext, references: ObjectReference[]): void =>
  requireChange(ctx, 'delete', ...references)

const uploadUserObject = async (ctx: AuthContext, reference: ObjectReference, data: ObjectPayload, options?: UploadOptions) => {
  requireChange(ctx, 'write', reference)
  return await uploadObject(reference, data, options)
}

const moveUserObject = async (ctx: AuthContext, reference: ObjectReference, newPath: string) => {
  requireChange(ctx, 'write', reference, destinationOf(reference, newPath))
  return await moveObject(reference, newPath)
}

const deleteUserObject = async (ctx: AuthContext, reference: ObjectReference) => {
  requireChange(ctx, 'delete', reference)
  return await deleteObject(reference)
}

const listUserDirectory = async (ctx: AuthContext, reference: ObjectReference, params?: DirectoryListingParams) => {
  requireOn(ctx, 'read', reference.bucket)
  return params === undefined ? await listDirectory(reference) : await listDirectory(reference, params)
}

const SIGNED_URL_LIFETIME_MS = 3_600_000

// STS-7
const getUserSignedURL = async (ctx: AuthContext, reference: ObjectReference): Promise<{ url: string, expiresAt: Date }> => {
  requireOn(ctx, 'read', reference.bucket)
  const expiresAt = new Date(Date.now() + SIGNED_URL_LIFETIME_MS)
  return { url: await getSignedURL(reference, expiresAt), expiresAt }
}

const createUserDirectory = async (ctx: AuthContext, reference: ObjectReference) => {
  requireChange(ctx, 'write', reference)
  return await createDirectory(reference)
}

const moveUserDirectory = async (ctx: AuthContext, reference: ObjectReference, newPath: string) => {
  requireChange(ctx, 'write', reference, destinationOf(reference, newPath))
  return await moveDirectory(reference, newPath)
}

const deleteUserDirectory = async (ctx: AuthContext, reference: ObjectReference) => {
  requireChange(ctx, 'delete', reference)
  return await deleteDirectory(reference)
}

// STS-4
const processUserDirectoryContents = async (ctx: AuthContext, bucketId: string, contents: DirectoryContents) => {
  requireOn(ctx, 'read', bucketId)
  const processed = await processDirectoryContents(bucketId, contents)
  return contents.next === undefined ? processed : { ...processed, next: contents.next }
}

export {
  InternalReadOnlyError,
  getUserBucketReferences,
  requireUserWrites,
  requireUserDeletes,
  uploadUserObject,
  moveUserObject,
  deleteUserObject,
  listUserDirectory,
  getUserSignedURL,
  createUserDirectory,
  moveUserDirectory,
  deleteUserDirectory,
  processUserDirectoryContents
}
