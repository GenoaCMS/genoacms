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

/**
 * Adapters accept a string or buffer as readily as a stream, and the CMS writes its own JSON
 * documents as strings. The declaration previously named only the stream, which every internal
 * write then contradicted.
 */
type ObjectPayload = string | Buffer | NodeJS.ReadableStream

/**
 * An opaque token identifying one version of an object — a GCS generation, an S3 or MinIO etag.
 *
 * **Opaque on purpose.** These are not comparable, orderable, or meaningful across providers;
 * treating a version as a number or a timestamp would produce code that works against one adapter
 * and fails subtly against another. It may only be passed back to `uploadObject`.
 */
type ObjectVersion = string

interface UploadOptions {
  gzip?: boolean
  /**
   * Write only if the object still has this version. A stale token is rejected rather than
   * overwriting, which is what prevents one writer silently erasing another's update.
   */
  ifVersion?: ObjectVersion
  /** Write only if the object does not exist. Exactly one of any number of racing callers wins. */
  ifAbsent?: boolean
}

interface ObjectData {
  data: NodeJS.ReadableStream
  /**
   * The version read, for passing to a later conditional write. Absent when the adapter cannot
   * supply one, in which case `ifVersion` cannot be used against that object.
   */
  version?: ObjectVersion
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
  ObjectVersion,
  UploadOptions,
  ObjectData,
  DirectoryListingParams,
  DirectoryContents
}
