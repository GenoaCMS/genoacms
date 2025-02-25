import {
  createDirectory,
  deleteObject,
  listDirectory,
  processDirectoryContents,
  uploadObject
} from '$lib/script/storage/storage.server'
import { join } from 'path'
import { isString } from '$lib/script/utils'
import { fail } from '@sveltejs/kit'

const removePathDelimiter = (path: string) => path.replaceAll('|->', '')

const pathToSegments = (path: string) => path.split('|->')

const segmentsToPath = (segments: Array<string>) => segments.join('|->')

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
    const directoryPath = join(path, directoryName)

    await createDirectory({
      bucket: bucketId,
      name: directoryPath
    })
  },
  deleteFile: async ({
    params,
    request
  }) => {
    const {
      bucketId,
      path
    } = params
    const data = await request.formData()
    const fileName = data.get('fileName')
    if (!isString(fileName)) return fail(400, { reason: 'missing-file-name' })
    await deleteObject({
      bucket: bucketId,
      name: join(path, fileName)
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
    const data = await request.formData()
    const files = data.getAll('files[]') as Array<File>
    if (files.length === 0) return
    let uploads: Array<Promise<void>> = []
    for (const file of files) {
      const reference = {
        bucket: bucketId,
        name: join(path, file.name)
      }
      uploads = [
        ...uploads,
        uploadObject(reference, file.stream())
      ]
    }
    await Promise.all(uploads)
  }
}
