interface ObjectReference {
  bucket: string
  name: string
}

interface StorageObject {
  name: string
  size: number
  lastModified: Date
}

type objectPayload = string | Buffer | NodeJS.ReadableStream

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

type getObject = (reference: ObjectReference) => Promise<ObjectData>
type getSignedURL = (reference: ObjectReference) => Promise<string>
type getPublicURL = (reference: ObjectReference) => Promise<string>
type uploadObject = (reference: ObjectReference, data: objectPayload) => Promise<void>
type deleteObject = (reference: ObjectReference) => Promise<void>
type listDirectory = (reference: ObjectReference, params?: DirectoryListingParams) => Promise<DirectoryContents>
type createDirectory = (reference: ObjectReference) => Promise<void>

export type {
  ObjectReference,
  StorageObject,
  objectPayload,
  ObjectData,
  DirectoryListingParams,
  DirectoryContents,
  getObject,
  getSignedURL,
  getPublicURL,
  uploadObject,
  deleteObject,
  listDirectory,
  createDirectory
}
