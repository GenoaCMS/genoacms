import type {
  ObjectName,
  ObjectReference,
  ObjectPayload,
  ObjectData,
  DirectoryListingParams,
  DirectoryContents
} from './types.d.ts'

type getObject = (reference: ObjectReference) => Promise<ObjectData>
type getSignedURL = (reference: ObjectReference, expires: Date) => Promise<string>
type getPublicURL = (reference: ObjectReference) => Promise<string>
type uploadObject = (reference: ObjectReference, data: ObjectPayload, options: UploadOptions) => Promise<void>
type renameObject = (reference: ObjectReference, destination: ObjectName) => Promise<void>
type deleteObject = (reference: ObjectReference) => Promise<void>
type listDirectory = (reference: ObjectReference, params?: DirectoryListingParams) => Promise<DirectoryContents>
type createDirectory = (reference: ObjectReference) => Promise<void>
type deleteDirectory = (reference: ObjectReference) => Promise<void>

interface Adapter {
  getObject: getObject
  getSignedURL: getSignedURL
  getPublicURL: getPublicURL
  uploadObject: uploadObject
  renameObject: renameObject
  deleteObject: deleteObject
  listDirectory: listDirectory
  createDirectory: createDirectory
  deleteDirectory: deleteDirectory
}

export default Adapter
