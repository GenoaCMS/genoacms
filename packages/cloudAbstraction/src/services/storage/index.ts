interface ObjectReference {
  bucket: string
  name: string
}
interface StorageObject {
  name: string
  size: number
  lastModified: Date
}
interface ObjectData {
  data: NodeJS.ReadableStream
}
interface DirectoryListingParams {
  startAfter?: string
  limit?: number
}

type getObject = (reference: ObjectReference) => Promise<ObjectData>
type uploadObject = (reference: ObjectReference, stream: NodeJS.ReadableStream) => Promise<void>
type deleteObject = (reference: ObjectReference) => Promise<void>
type listDirectory = (reference: ObjectReference, params?: DirectoryListingParams) => Promise<StorageObject[]>
type createDirectory = (reference: ObjectReference) => Promise<void>

export type {
  StorageObject,
  getObject,
  uploadObject,
  deleteObject,
  listDirectory,
  createDirectory
}
