import { config } from '@genoacms/cloudabstraction'

const {
  createDirectory,
  deleteObject,
  getObject,
  listDirectory,
  uploadObject
} = await config.storage.adapter

const getBucketReferences = () => {
  return config.storage.buckets
}

export {
  getBucketReferences,
  createDirectory,
  deleteObject,
  getObject,
  listDirectory,
  uploadObject
}
