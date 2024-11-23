import type { Adapter } from './adapter'

interface StorageProvider {
  adapter: Promise<typeof Adapter>
}

interface BucketInit {
  name: string
  providerName: string
}

export type {
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
} from './adapter'
