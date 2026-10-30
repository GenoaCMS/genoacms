import { PreconditionFailedError } from '@genoacms/contracts/storage'
import type { AuthContext } from '#lib/script/authorization/context.js'
import {
  createUserDirectory,
  deleteUserDirectory,
  deleteUserObject,
  getUserBucketReferences,
  getUserSignedURL,
  listUserDirectory,
  moveUserDirectory,
  moveUserObject,
  uploadUserObject
} from '#lib/script/storage/user.server.js'
import { StorageToolError, requireDirectoryPath, requireObjectName, requireSubdirectoryPath } from './storageNames'

type Args = Record<string, unknown>

const MAX_UPLOAD_BYTES = 4_194_304
const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/

const withoutUndefined = <T extends object>(params: T): Partial<T> =>
  Object.fromEntries(Object.entries(params).filter(([, value]) => value !== undefined)) as Partial<T>

function decodeContent (name: string, content: string, encoding: unknown): Buffer {
  if (encoding !== 'base64') return Buffer.from(content, 'utf8')
  if (!BASE64.test(content) || content.length % 4 !== 0) {
    throw new StorageToolError('storage/invalid-content', `storage/invalid-content: ${name} is not base64`)
  }
  return Buffer.from(content, 'base64')
}

function requireWithinLimit (bytes: Buffer): void {
  if (bytes.length > MAX_UPLOAD_BYTES) {
    throw new StorageToolError('storage/too-large', `storage/too-large: ${bytes.length} bytes exceed ${MAX_UPLOAD_BYTES}`)
  }
}

const exists = (bucket: string, name: string): StorageToolError =>
  new StorageToolError('storage/exists', `storage/exists: ${bucket}/${name}`)

const parentOf = (name: string): string => name.slice(0, name.lastIndexOf('/') + 1)

async function objectExists (ctx: AuthContext, bucket: string, name: string): Promise<boolean> {
  let pageToken: string | undefined
  do {
    const page = await listUserDirectory(ctx, { bucket, name: parentOf(name) }, withoutUndefined({ pageToken }))
    if (page.files.some(file => file.name === name)) return true
    pageToken = page.next
  } while (pageToken !== undefined)
  return false
}

async function directoryHoldsAnything (ctx: AuthContext, bucket: string, path: string): Promise<boolean> {
  const { files, directories } = await listUserDirectory(ctx, { bucket, name: path }, { limit: 1 })
  return files.length + directories.length > 0
}

/** TOL-24 */
async function listBuckets (ctx: AuthContext) {
  return getUserBucketReferences(ctx).map(({ name }) => ({ name }))
}

/** TOL-24 */
async function listDirectory (ctx: AuthContext, { bucket, path, pageToken, limit }: Args) {
  const directory = (path as string | undefined) ?? ''
  requireDirectoryPath(directory)
  const { files, directories, next } = await listUserDirectory(ctx, { bucket: bucket as string, name: directory }, withoutUndefined({
    pageToken: pageToken as string | undefined,
    limit: limit as number | undefined
  }))
  const listing = {
    files: files.map(file => ({ name: file.name, size: file.size, lastModified: file.lastModified.toISOString() })),
    directories: directories.map(({ name }) => name)
  }
  return next === undefined ? listing : { ...listing, next }
}

/** TOL-25 */
async function getObject (ctx: AuthContext, { bucket, name }: Args) {
  requireObjectName(name as string)
  const { url, expiresAt } = await getUserSignedURL(ctx, { bucket: bucket as string, name: name as string })
  return { url, expiresAt: expiresAt.toISOString() }
}

/** TOL-26 */
async function uploadObject (ctx: AuthContext, { bucket, name, content, encoding, overwrite }: Args) {
  const reference = { bucket: bucket as string, name: name as string }
  requireObjectName(reference.name)
  const bytes = decodeContent(reference.name, content as string, encoding)
  requireWithinLimit(bytes)
  try {
    await uploadUserObject(ctx, reference, bytes, overwrite === true ? {} : { ifAbsent: true })
  } catch (error) {
    if (error instanceof PreconditionFailedError) throw new StorageToolError('storage/exists', `storage/exists: ${reference.bucket}/${reference.name}`)
    throw error
  }
  return { name: reference.name }
}

/** TOL-27 */
async function moveObject (ctx: AuthContext, { bucket, name, destination, overwrite }: Args) {
  requireObjectName(name as string)
  requireObjectName(destination as string)
  if (overwrite !== true && await objectExists(ctx, bucket as string, destination as string)) throw exists(bucket as string, destination as string)
  await moveUserObject(ctx, { bucket: bucket as string, name: name as string }, destination as string)
  return {}
}

/** TOL-27 */
async function deleteObject (ctx: AuthContext, { bucket, name }: Args) {
  requireObjectName(name as string)
  await deleteUserObject(ctx, { bucket: bucket as string, name: name as string })
  return {}
}

/** TOL-28 */
async function createDirectory (ctx: AuthContext, { bucket, path }: Args) {
  requireSubdirectoryPath(path as string)
  await createUserDirectory(ctx, { bucket: bucket as string, name: path as string })
  return {}
}

/** TOL-28 */
async function moveDirectory (ctx: AuthContext, { bucket, path, destination, overwrite }: Args) {
  requireSubdirectoryPath(path as string)
  requireDirectoryPath(destination as string)
  if ((destination as string).startsWith(path as string)) throw new StorageToolError('storage/invalid-name', `storage/invalid-name: ${destination as string}`)
  if (overwrite !== true && await directoryHoldsAnything(ctx, bucket as string, destination as string)) throw exists(bucket as string, destination as string)
  await moveUserDirectory(ctx, { bucket: bucket as string, name: path as string }, destination as string)
  return {}
}

/** TOL-28 */
async function deleteDirectory (ctx: AuthContext, { bucket, path }: Args) {
  requireSubdirectoryPath(path as string)
  await deleteUserDirectory(ctx, { bucket: bucket as string, name: path as string })
  return {}
}

export { listBuckets, listDirectory, getObject, uploadObject, moveObject, deleteObject, createDirectory, moveDirectory, deleteDirectory }
