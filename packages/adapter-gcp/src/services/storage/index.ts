import type {
  listDirectory as listDirectoryT,
  StorageObject
} from '@genoacms/cloudabstraction/src/services/storage'
import { Storage } from '@google-cloud/storage'
import config from '@genoacms/cloudabstraction/src/config'

const storage = new Storage({
  // @ts-expect-error: TODO: type this adapter
  credentials: config.adapter.gcp.credentials
})
// @ts-expect-error: TODO: type this adapter
const bucket = storage.bucket(config.adapter.gcp.storage.bucket)

const listDirectory: listDirectoryT = async ({ limit, prefix }) => {
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
    } as StorageObject
  })
}

export {
  listDirectory
}
