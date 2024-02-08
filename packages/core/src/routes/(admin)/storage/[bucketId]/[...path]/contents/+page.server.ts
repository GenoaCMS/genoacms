import {
  createDirectory,
  deleteObject,
  listDirectory,
  processDirectoryContents,
  uploadObject
} from '$lib/script/storage'
import { join } from 'path'

const removeRoutingSlashes = (path: string) => {
  return path.replaceAll('//', '/')
}

export const load = async ({ params }) => {
  let {
    bucketId,
    path
  } = params
  path = removeRoutingSlashes(path)

  const contents = await listDirectory({ // TODO: fix reading format of adapter-gcp
    bucket: bucketId,
    name: path
  })

  return {
    bucketId,
    path,
    contents: processDirectoryContents(contents)
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
    if (!directoryName || typeof directoryName !== 'string') return
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
    if (!fileName || typeof fileName !== 'string') return
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
