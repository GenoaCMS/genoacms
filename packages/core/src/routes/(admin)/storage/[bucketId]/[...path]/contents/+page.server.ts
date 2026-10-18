import {
  createUserDirectory,
  deleteUserObject,
  listUserDirectory,
  processUserDirectoryContents,
  uploadUserObject,
  moveUserObject,
  deleteUserDirectory,
  moveUserDirectory,
  requireUserWrites,
  requireUserDeletes,
  InternalReadOnlyError
} from '$lib/script/storage/user.server'
import {
  directoryOfRoute,
  routeOfDirectory,
  isAcceptedName,
  parseContents,
  parentOf,
  lastLevelOf,
  isDirectoryReference
} from '$lib/script/storage/browserPaths'
import { actInTurn, type BulkResult } from '$lib/script/storage/bulkResult'
import { requireAuthContext } from '$lib/script/authorization/request.server'
import { PermissionDeniedError } from '$lib/script/authorization/enforce'
import type { AuthContext } from '$lib/script/authorization/context'
import { isString } from '$lib/script/utils'
import { readableStreamToReadable } from '$lib/script/utils.server'
import { error, fail } from '@sveltejs/kit'
import type { Actions } from './$types'
import { host } from '$lib/script/host.server'
import type { ObjectReference } from '@genoacms/contracts/storage'

const delimiter = host.pathDelimiter

const directoryOf = (path: string | undefined): string => directoryOfRoute(path ?? '', delimiter)

// BRW-2
const backLinkOf = (bucket: string, directory: string): string =>
  directory === '' ? '/storage' : routeOfDirectory(bucket, parentOf(directory), delimiter)

// BRW-16
const refusalOf = (caught: unknown) => {
  if (caught instanceof PermissionDeniedError) return fail(403, { reason: 'permission-denied' })
  if (caught instanceof InternalReadOnlyError) return fail(403, { reason: 'internal-read-only' })
  throw caught
}

const refusingWith403 = async <T>(act: () => Promise<T>) => {
  try {
    return await act()
  } catch (caught) {
    return refusalOf(caught)
  }
}

// BRW-14
const reported = (result: BulkResult) => result.failed.length === 0 ? undefined : fail(500, result)

const moveOne = async (ctx: AuthContext, reference: ObjectReference, destination: string) =>
  isDirectoryReference(reference.name)
    ? await moveUserDirectory(ctx, reference, destination)
    : await moveUserObject(ctx, reference, destination)

const deleteOne = async (ctx: AuthContext, reference: ObjectReference) =>
  isDirectoryReference(reference.name)
    ? await deleteUserDirectory(ctx, reference)
    : await deleteUserObject(ctx, reference)

const isBelowItself = (reference: ObjectReference, directory: string): boolean =>
  isDirectoryReference(reference.name) && directory.startsWith(reference.name)

export const load = async ({ params, locals }) => {
  const ctx = requireAuthContext(locals)
  const { bucketId, path } = params
  const directory = directoryOf(path)
  try {
    const page = await listUserDirectory(ctx, { bucket: bucketId, name: directory })
    return {
      bucketId,
      delimiter,
      navigationPath: path,
      path: directory,
      parentPath: backLinkOf(bucketId, directory),
      contents: await processUserDirectoryContents(ctx, bucketId, page)
    }
  } catch (caught) {
    if (caught instanceof PermissionDeniedError) error(403, 'permission-denied')
    throw caught
  }
}

export const actions = {
  // BRW-7, BRW-13
  createDirectory: async ({ params, request, locals }) => {
    const ctx = requireAuthContext(locals)
    const name = (await request.formData()).get('directoryName')
    if (!isString(name)) return fail(400, { reason: 'missing-directory-name' })
    if (!isAcceptedName(name, delimiter)) return fail(400, { reason: 'invalid-name' })
    const reference = { bucket: params.bucketId, name: `${directoryOf(params.path)}${name}/` }
    return await refusingWith403(async () => { await createUserDirectory(ctx, reference) })
  },
  // BRW-6, BRW-13, BRW-14
  uploadObject: async ({ params, request, locals }) => {
    const ctx = requireAuthContext(locals)
    const files = (await request.formData()).getAll('files').filter((file): file is File => file instanceof File)
    if (files.length === 0) return
    if (!files.every(file => isAcceptedName(file.name, delimiter))) return fail(400, { reason: 'invalid-name' })
    const directory = directoryOf(params.path)
    const uploads = files.map(file => ({ file, reference: { bucket: params.bucketId, name: `${directory}${file.name}` } }))
    return await refusingWith403(async () => {
      requireUserWrites(ctx, uploads.map(upload => upload.reference))
      return reported(await actInTurn(uploads, upload => upload.reference.name, async ({ file, reference }) =>
        await uploadUserObject(ctx, reference, readableStreamToReadable(file.stream()))))
    })
  },
  // BRW-9, BRW-11, BRW-14
  move: async ({ params, request, locals }) => {
    const ctx = requireAuthContext(locals)
    const value = (await request.formData()).get('contents')
    if (value === null) return fail(400, { reason: 'missing-file-name' })
    const contents = parseContents(value)
    if (contents === undefined) return fail(400, { reason: 'invalid-contents' })
    const directory = directoryOf(params.path)
    const moves = contents
      .filter(reference => reference.bucket === params.bucketId && parentOf(reference.name) !== directory)
      .map(reference => ({ reference, destination: `${directory}${lastLevelOf(reference.name)}` }))
    const allowed = moves.filter(({ reference }) => !isBelowItself(reference, directory))
    return await refusingWith403(async () => {
      requireUserWrites(ctx, allowed.flatMap(({ reference, destination }) => [reference, { bucket: reference.bucket, name: destination }]))
      return reported(await actInTurn(moves, move => move.reference.name, async ({ reference, destination }) => {
        if (isBelowItself(reference, directory)) throw new Error(`storage/below-itself: ${reference.name}`)
        await moveOne(ctx, reference, destination)
      }))
    })
  },
  // BRW-8, BRW-13
  rename: async ({ params, request, locals }) => {
    const ctx = requireAuthContext(locals)
    const data = await request.formData()
    const name = data.get('name')
    const newName = data.get('newName')
    if (!isString(name)) return fail(400, { reason: 'missing-name' })
    if (!isString(newName)) return fail(400, { reason: 'missing-new-name' })
    const isDirectory = isDirectoryReference(name)
    const level = isDirectory ? name.slice(0, -1) : name
    if (!isAcceptedName(level, delimiter) || !isAcceptedName(newName, delimiter)) return fail(400, { reason: 'invalid-name' })
    const directory = directoryOf(params.path)
    const reference = { bucket: params.bucketId, name: `${directory}${name}` }
    const destination = `${directory}${newName}${isDirectory ? '/' : ''}`
    return await refusingWith403(async () => { await moveOne(ctx, reference, destination) })
  },
  // BRW-10, BRW-11, BRW-14
  delete: async ({ request, locals }) => {
    const ctx = requireAuthContext(locals)
    const value = (await request.formData()).get('contents')
    if (value === null) return fail(400, { reason: 'missing-contents' })
    const contents = parseContents(value)
    if (contents === undefined) return fail(400, { reason: 'invalid-contents' })
    return await refusingWith403(async () => {
      requireUserDeletes(ctx, contents)
      return reported(await actInTurn(contents, reference => reference.name, async reference => { await deleteOne(ctx, reference) }))
    })
  }
} satisfies Actions
