import type {
  storage as storageT
} from '@genoacms/cloudabstraction'
import { type Bucket, Storage } from '@google-cloud/storage'
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
  const [files] = await bucketInstance.getFiles({
    prefix: name,
    maxResults: listingParams?.limit,
    startOffset: listingParams?.startAfter
  })
  return files.map((file) => {
    return {
      name: file.name,
      size: file.metadata.size as number,
      lastModified: new Date(file.metadata.updated as string)
    } satisfies storageT.StorageObject
  })
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
