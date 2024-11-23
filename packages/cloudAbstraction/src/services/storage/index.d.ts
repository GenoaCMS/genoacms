import type { Adapter } from './adapter'

type StorageProvider<Extension extends object = object> = Extension & {
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
