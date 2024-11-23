import type { Adapter } from './adapter'

interface Provider {
  adapter: Promise<typeof Adapter>
}

interface BucketInit {
  name: string
  provider: Provider
}

export type {
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
