import type {
  storage as storageT
} from '@genoacms/cloudabstraction'
import { type Bucket, Storage, type File } from '@google-cloud/storage'
import config from '../../config.js'

const storage = new Storage({
  credentials: config.storage.credentials
})

const getBucket = (name: string): Bucket => {
  if (!config.storage.buckets.includes(name)) throw new Error('bucket-unregistered')
  const bucket = storage.bucket(name)
  return bucket
}

const getObject: storageT.getObject = async ({ bucket, name }) => {
  const bucketInstance = getBucket(bucket)
  const file = bucketInstance.file(name)

  return {
    data: file.createReadStream()
  }
}

const uploadObject: storageT.uploadObject = async ({ bucket, name }, stream) => {
  const bucketInstance = getBucket(bucket)
  const file = bucketInstance.file(name)
  await file.save(stream)
}

const deleteObject: storageT.deleteObject = async ({ bucket, name }) => {
  const bucketInstance = getBucket(bucket)
  const file = bucketInstance.file(name)
  await file.delete()
}

const listDirectory: storageT.listDirectory = async ({ bucket, name }, listingParams = {}) => {
  const bucketInstance = getBucket(bucket)
  const options = {
    autoPaginate: false,
    prefix: name,
    maxResults: listingParams?.limit,
    startOffset: listingParams?.startAfter,
    delimiter: '/'
  }
  const [files, , apiResponse] =
      (await bucketInstance.getFiles(options)) as [File[], object, { prefixes: string[] } | undefined ]
  return {
    files: files.map((file) => {
      return {
        name: file.name,
        // eslint-disable-next-line @typescript-eslint/strict-boolean-expressions
        size: file.metadata.size ? parseInt(file.metadata.size as string) : 0,
        lastModified: new Date(file.metadata.updated as string)
      } satisfies storageT.StorageObject
    }),
    directories: apiResponse?.prefixes ?? []
  }
}

const createDirectory: storageT.createDirectory = async ({ bucket, name }) => {
  const bucketInstance = getBucket(bucket)
  const file = bucketInstance.file(`${name}/.folderPlaceholder`)
  await file.save('')
}

export {
  getObject,
  uploadObject,
  deleteObject,
  listDirectory,
  createDirectory
}
