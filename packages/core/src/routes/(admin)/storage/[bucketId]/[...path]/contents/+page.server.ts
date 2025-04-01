import {
  createDirectory,
  deleteObject,
  listDirectory,
  processDirectoryContents,
  uploadObject,
  moveObject,
  deleteDirectory,
  fullyQualifiedNameToPath,
  fullyQualifiedNameToFilename,
  moveDirectory
} from '$lib/script/storage/storage.server'
import { join } from 'path'
import { isString } from '$lib/script/utils'
import { readableStreamToReadable } from '$lib/script/utils.server'
import { fail, type Actions } from '@sveltejs/kit'
import { config } from '@genoacms/cloudabstraction'
import type { ObjectReference } from '@genoacms/cloudabstraction/storage'

const delimiter = config.storage?.pathDelimiter || '|->'

const removePathDelimiter = (path: string) => path.replaceAll(delimiter, '')

const pathToSegments = (path: string) => path.split(delimiter)

const segmentsToPath = (segments: Array<string>) => segments.join(delimiter)

const resolveParentPath = (bucketId: string, path: string) => {
  const pathSegments = pathToSegments(path)
  if (pathSegments.length <= 1) return '/storage'
  pathSegments.pop()
  const parentPath = segmentsToPath(pathSegments)
  const newPath = `/storage/${bucketId}/${parentPath}/contents`
  return newPath
}

export const load = async ({ params }) => {
  const {
    bucketId,
    path
  } = params

  const contents = await listDirectory({
    bucket: bucketId,
    name: removePathDelimiter(path)
  })

  return {
    bucketId,
    delimiter,
    navigationPath: path,
    path: removePathDelimiter(path),
    parentPath: resolveParentPath(bucketId, path),
    contents: await processDirectoryContents(bucketId, contents)
  }
}

export const actions = {
  createDirectory: async ({
    params,
    request
  }) => {
    const {
      bucketId,
      path
    } = params

    const data = await request.formData()
    const directoryName = data.get('directoryName')
    if (!isString(directoryName)) return fail(400, { reason: 'missing-directory-name' })
    const cleanPath = removePathDelimiter(path || '')
    const directoryPath = join(cleanPath, directoryName)

    await createDirectory({
      bucket: bucketId,
      name: directoryPath
    })
  },
  uploadObject: async ({
    params,
    request
  }) => {
    const {
      bucketId,
      path
    } = params
    if (!isString(bucketId)) return fail(400, { reason: 'missing-bucket-id' })
    const cleanPath = removePathDelimiter(path || '')
    const data = await request.formData()
    const files = data.getAll('files[]') as Array<File>
    if (files.length === 0) return
    const uploads: Array<Promise<void>> = []
    for (const file of files) {
      const reference = {
        bucket: bucketId,
        name: join(cleanPath, file.name)
      }
      const nodejsStream = readableStreamToReadable(file.stream())
      const uploadOperation = uploadObject(reference, nodejsStream)
      uploads.push(uploadOperation)
    }
    await Promise.all(uploads)
  },
  move: async ({
    params,
    request
  }) => {
    const {
      bucketId,
      path
    } = params
    if (!isString(bucketId)) return fail(400, { reason: 'missing-bucket-id' })
    const data = await request.formData()
    const contentsString = data.get('contents')
    if (!isString(contentsString)) return fail(400, { reason: 'missing-file-name' })
    const contents = JSON.parse(contentsString) as Array<ObjectReference>
    const processedContents = contents.map(c => {
      return {
        ...c,
        isDirectory: c.name.endsWith('/'),
        path: fullyQualifiedNameToPath(c.name),
        filename: fullyQualifiedNameToFilename(c.name)
      }
    })
    const objectsToMove = processedContents.filter(o => o.bucket === bucketId && o.path !== path)
    const moves: Array<Promise<void>> = []
    const cleanPath = removePathDelimiter(path || '')
    for (const object of objectsToMove) {
      const move = object.isDirectory ? moveDirectory : moveObject
      const newPath = join(cleanPath, object.filename, object.isDirectory ? '/' : '')
      const promise = move(object, newPath)
      moves.push(promise)
    }
    await Promise.all(moves)
  },
  rename: async ({
    params,
    request
  }) => {
    const {
      bucketId,
      path
    } = params
    if (!isString(bucketId)) return fail(400, { reason: 'missing-bucket-id' })
    const data = await request.formData()
    const isDirectory = Boolean(data.get('isDirectory'))
    const name = data.get('name')
    const newName = data.get('newName')
    if (!isString(name)) return fail(400, { reason: 'missing-name' })
    if (!isString(newName)) return fail(400, { reason: 'missing-new-name' })
    const cleanPath = removePathDelimiter(path || '')
    const reference = {
      bucket: bucketId,
      name: join(cleanPath, name)
    }
    const newPath = join(cleanPath, newName)
    const move = isDirectory ? moveDirectory : moveObject
    await move(reference, newPath)
  },
  delete: async ({
    request
  }) => {
    const data = await request.formData()
    const contentsString = data.get('contents')
    if (!isString(contentsString)) return fail(400, { reason: 'missing-contents' })
    const contents: Array<ObjectReference> = JSON.parse(contentsString)
    const deletes: Array<Promise<void>> = []
    for (const reference of contents) {
      const isDirectory = reference.name.endsWith('/')
      const deleteF = isDirectory ? deleteDirectory : deleteObject
      deletes.push(deleteF(reference))
    }
    await Promise.all(deletes)
  }
} satisfies Actions
