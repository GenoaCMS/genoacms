import type Adapter from './adapter.d.ts'

declare module '@genoacms/adapter-*/storage' {
  import type Adapter from './adapter.d.ts'
  const getObject: Adapter.getObject
  const getSignedURL: Adapter.getSignedURL
  const getPublicURL: Adapter.getPublicURL
  const uploadObject: Adapter.uploadObject
  const deleteObject: Adapter.deleteObject
  const listDirectory: Adapter.listDirectory
  const createDirectory: Adapter.createDirectory
  export {
    getObject,
    getSignedURL,
    getPublicURL,
    uploadObject,
    deleteObject,
    listDirectory,
    createDirectory
  }
}

type StorageProvider<Extension extends object = object> = Extension & {
  name: string
  adapter: Promise<typeof Adapter>
}

interface BucketInit {
  name: string
  providerName: string
}

export type {
  Adapter,
  StorageProvider,
  BucketInit
}
export type {
  ObjectReference,
  StorageObject,
  ObjectPayload,
  ObjectData,
  DirectoryListingParams,
  DirectoryContents
} from './types.d.ts'
