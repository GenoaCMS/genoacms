type ObjectName = string

interface ObjectReference {
  bucket: string
  name: ObjectName
}

interface StorageObject {
  name: string
  size: number
  lastModified: Date
}

type ObjectPayload = NodeJS.ReadableStream

interface UploadOptions {
  gzip?: boolean
}

interface ObjectData {
  data: NodeJS.ReadableStream
}

interface DirectoryListingParams {
  startAfter?: string
  limit?: number
}

interface DirectoryContents {
  files: StorageObject[]
  directories: ObjectReference[]
}

export type {
  ObjectName,
  ObjectReference,
  StorageObject,
  ObjectPayload,
  UploadOptions,
  ObjectData,
  DirectoryListingParams,
  DirectoryContents
}
