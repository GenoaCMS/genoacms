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

export namespace Adapter {
  type getObject = (reference: ObjectReference) => Promise<ObjectData>
  type getSignedURL = (reference: ObjectReference, expires: Date) => Promise<string>
  type getPublicURL = (reference: ObjectReference) => Promise<string>
  type uploadObject = (reference: ObjectReference, data: ObjectPayload, options: UploadOptions) => Promise<void>
  type deleteObject = (reference: ObjectReference) => Promise<void>
  type listDirectory = (reference: ObjectReference, params?: DirectoryListingParams) => Promise<DirectoryContents>
  type createDirectory = (reference: ObjectReference) => Promise<void>
}

export type {
  ObjectReference,
  StorageObject,
  ObjectPayload,
  ObjectData,
  DirectoryListingParams,
  DirectoryContents
}
