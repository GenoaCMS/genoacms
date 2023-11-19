import type {
  storage as storageT
} from '@genoacms/cloudabstraction'
import { Storage } from '@google-cloud/storage'
import { config } from '@genoacms/cloudabstraction'

const storage = new Storage({
  // @ts-expect-error: TODO: type this adapter
  credentials: config.adapter.gcp.credentials
})
// @ts-expect-error: TODO: type this adapter
const bucket = storage.bucket(config.adapter.gcp.storage.bucket)

const listDirectory: storageT.listDirectory = async ({ limit, prefix }) => {
  const [files] = await bucket.getFiles({
    prefix,
    maxResults: limit
  })
  return files.map((file) => {
    return {
      name: file.name,
      size: file.metadata.size,
      // @ts-expect-error: Handle this
      lastModified: new Date(file.metadata.updated)
    } as storageT.StorageObject
  })
}

export {
  listDirectory
}
