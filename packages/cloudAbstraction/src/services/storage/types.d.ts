interface ObjectReference {
  bucket: string
  name: string
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
