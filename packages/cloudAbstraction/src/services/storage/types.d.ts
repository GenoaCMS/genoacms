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

type ObjectPayload = string | Buffer | NodeJS.ReadableStream

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
  directories: string[]
}

export type {
  ObjectName,
  ObjectReference,
  StorageObject,
  ObjectPayload,
  ObjectData,
  DirectoryListingParams,
  DirectoryContents
}
