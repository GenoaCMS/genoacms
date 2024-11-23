import { config } from '@genoacms/cloudabstraction'
import { getProvider } from '../providers.server'
import type { Adapter, BucketInit, ObjectReference } from '@genoacms/cloudabstraction/storage'

async function getProviderByBucketName (bucketName: string): Promise<Adapter> {
  const bucketInit = config.storage.buckets.find((bucket: BucketInit) => bucket.name === bucketName)
  if (!bucketInit) throw new Error('bucket/not-found')
  return await getProvider(config.storage.providers, bucketInit.providerName)
}

async function getObject (reference: ObjectReference) {
  const provider = await getProviderByBucketName(reference.bucket)
  return await provider.getObject(reference)
}

async function getSignedURL (reference: ObjectReference, expires: Date) {
  const provider = await getProviderByBucketName(reference.bucket)
  return await provider.getSignedURL(reference, expires)
}

async function getPublicURL (reference: ObjectReference) {
  const provider = await getProviderByBucketName(reference.bucket)
  return await provider.getPublicURL(reference)
}

async function uploadObject (reference: ObjectReference, data: ObjectPayload, options: UploadOptions) {
  const provider = await getProviderByBucketName(reference.bucket)
  return await provider.uploadObject(reference, data, options)
}

async function listDirectory (reference: ObjectReference) {
  const provider = await getProviderByBucketName(reference.bucket)
  return await provider.listDirectory(reference)
}

async function deleteObject (reference: ObjectReference) {
  const provider = await getProviderByBucketName(reference.bucket)
  return await provider.deleteObject(reference)
}

async function createDirectory (reference: ObjectReference) {
  const provider = await getProviderByBucketName(reference.bucket)
  return await provider.createDirectory(reference)
}

export {
  createDirectory,
  deleteObject,
  getObject,
  getPublicURL,
  getSignedURL,
  listDirectory,
  uploadObject
}
