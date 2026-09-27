import type Adapter from './adapter.d.ts'

/**
 * Raised when a conditional write (`ifVersion` / `ifAbsent`) was refused because the object was not
 * in the expected state. An ordinary outcome of losing a race, not a fault.
 */
declare class PreconditionFailedError extends Error {
  readonly reference: import('./types.d.ts').ObjectReference
  readonly reason: string
  constructor (reference: import('./types.d.ts').ObjectReference, reason: string)
}

declare function isPreconditionFailed (error: unknown): boolean

export {
  PreconditionFailedError,
  isPreconditionFailed
}

export type {
  Adapter
}
export type {
  ObjectReference,
  StorageObject,
  ObjectPayload,
  UploadOptions,
  ObjectData,
  DirectoryListingParams,
  DirectoryContents
} from './types.d.ts'
