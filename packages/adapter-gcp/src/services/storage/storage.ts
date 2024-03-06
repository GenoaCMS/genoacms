import config from '../../config.js'
import { type Bucket, Storage } from '@google-cloud/storage'

const storage = new Storage({
  credentials: config.storage.credentials
})

const getBucket = (name: string): Bucket => {
  if (!config.storage.buckets.includes(name)) throw new Error('bucket-unregistered')
  const bucket = storage.bucket(name)
  return bucket
}

export {
  getBucket
}
