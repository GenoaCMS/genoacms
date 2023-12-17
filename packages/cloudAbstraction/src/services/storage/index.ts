interface StorageObject {
  name: string
  size: number
  lastModified: Date
}
interface ObjectData {
  data: NodeJS.ReadableStream
}

interface DirectoryListingParams {
  prefix?: string
  startAfter?: string
  limit?: number
}

type getObject = (name: string) => Promise<ObjectData>
type uploadObject = (name: string, stream: NodeJS.ReadableStream) => Promise<void>
type deleteObject = (name: string) => Promise<void>
type listDirectory = (params: DirectoryListingParams) => Promise<StorageObject[]>
type createDirectory = (name: string) => Promise<void>

export type {
  StorageObject,
  getObject,
  uploadObject,
  deleteObject,
  listDirectory,
  createDirectory
}
