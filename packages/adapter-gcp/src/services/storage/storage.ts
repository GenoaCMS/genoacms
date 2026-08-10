import type { BucketInit } from '@genoacms/cloudabstraction/storage'
import type { StorageProvider } from '../../genoa.config.js'
import { type Bucket, Storage } from '@google-cloud/storage'
import { getProvider } from '@genoacms/cloudabstraction'
import config from '../../config.js'

const ADAPTER_PATH = '@genoacms/adapter-gcp/storage'
const provider = getProvider('storage', ADAPTER_PATH) as StorageProvider
const storage = new Storage({
  credentials: provider.credentials
})

const hasBucket = (name: string): boolean => {
  const has = config.storage.buckets.find((bucket: BucketInit) => bucket.name === name &&
    bucket.providerName === provider.name)
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
