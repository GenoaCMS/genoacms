import type {
  Adapter,
  StorageObject
} from '@genoacms/cloudabstraction/storage'
import { type File } from '@google-cloud/storage'
import { getBucket } from './storage.js'
import { join } from 'path'

const getObject: Adapter['getObject'] = async ({ bucket, name }) => {
  const bucketInstance = getBucket(bucket)
  const file = bucketInstance.file(name)

  return {
    data: file.createReadStream()
  }
}

const getPublicURL: Adapter['getPublicURL'] = async ({ bucket, name }) => {
  const bucketInstance = getBucket(bucket)
  const file = bucketInstance.file(name)
  return file.publicUrl()
}

const getSignedURL: Adapter['getSignedURL'] = async ({ bucket, name }, expires) => {
  const bucketInstance = getBucket(bucket)
  const file = bucketInstance.file(name)
  const [url] = await file.getSignedUrl({
    action: 'read',
    expires
  })
  return url
}

const uploadObject: Adapter['uploadObject'] = async ({ bucket, name }, stream, options) => {
  const bucketInstance = getBucket(bucket)
  const file = bucketInstance.file(name)
  await file.save(stream, options)
}

const deleteObject: Adapter['deleteObject'] = async ({ bucket, name }) => {
  const bucketInstance = getBucket(bucket)
  const file = bucketInstance.file(name)
  await file.delete()
}

const listDirectory: Adapter['listDirectory'] = async ({ bucket, name }, listingParams = {}) => {
  const bucketInstance = getBucket(bucket)
  const options = {
    autoPaginate: false,
    prefix: name,
    maxResults: listingParams?.limit,
    startOffset: listingParams?.startAfter,
    delimiter: '/'

  }
  let [files, , apiResponse] =
    (await bucketInstance.getFiles(options)) as [File[], object, { prefixes: string[] } | undefined]
  files = files.filter((file) => !file.name.endsWith('.folderPlaceholder'))

  return {
    files: files.map((file) => {
      return {
        name: file.name,
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        size: file.metadata.size ? parseInt(file.metadata.size as string) : 0,
        lastModified: new Date(file.metadata.updated as string)
      } satisfies StorageObject
    }),
    directories: (apiResponse?.prefixes ?? []).filter((item) => item !== name).map(i => i.replace(name, ''))
  }
}

const createDirectory: Adapter['createDirectory'] = async ({ bucket, name }) => {
  const bucketInstance = getBucket(bucket)
  const file = bucketInstance.file(`${name}/.folderPlaceholder`)
  await file.save('')
}

export {
  getObject,
  getPublicURL,
  getSignedURL,
  uploadObject,
  deleteObject,
  listDirectory,
  createDirectory
}
