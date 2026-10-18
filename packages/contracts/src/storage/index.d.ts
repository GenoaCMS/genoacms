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

/** Raised when `getObject` or `deleteObject` is given an object that does not exist. */
declare class ObjectNotFoundError extends Error {
  readonly name: 'ObjectNotFoundError'
  readonly reference: import('./types.d.ts').ObjectReference
  constructor (reference: import('./types.d.ts').ObjectReference)
}

declare function isNotFound (error: unknown): boolean

/** Raised when a directory method is given a name that is neither `''` nor ends in `/`. */
declare class NotADirectoryError extends Error {
  readonly name: 'NotADirectoryError'
  readonly reference: import('./types.d.ts').ObjectReference
  constructor (reference: import('./types.d.ts').ObjectReference)
}

declare function isDirectoryName (name: string): boolean

export {
  PreconditionFailedError,
  isPreconditionFailed,
  ObjectNotFoundError,
  isNotFound,
  NotADirectoryError,
  isDirectoryName
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
