import config from '../../config.js'
import { type Bucket, Storage } from '@google-cloud/storage'
import type { StorageProvider, BucketInit } from '@genoacms/cloudabstraction/storage'

const PROVIDER_NAME = '@genoacms/adapter-gcp/storage'
const storageConfig = config.storage.providers.find((provider: StorageProvider) => provider.name === PROVIDER_NAME)
if (!storageConfig) throw new Error('storage-provider-not-found')
const storage = new Storage({
  credentials: config.storage.credentials
})

const hasBucket = (name: string): boolean => {
  const has = config.storage.buckets.find((bucket: BucketInit) => bucket.name === name && bucket.providerName === PROVIDER_NAME)
  return !!has
}

const getBucket = (name: string): Bucket => {
  if (!hasBucket(name)) throw new Error('bucket-unregistered')
  const bucket = storage.bucket(name)
  return bucket
}

export {
  getBucket
}
