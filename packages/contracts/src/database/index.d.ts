import type Adapter from './adapter.d.ts'
import type { CollectionReference, DocumentReference } from './types.d.ts'

/** Raised when `updateDocument` is given a document that does not exist. */
declare class DocumentNotFoundError extends Error {
  readonly name: 'DocumentNotFoundError'
  readonly reference: DocumentReference<CollectionReference>
  constructor (reference: DocumentReference<CollectionReference>)
}

/** Raised when the store refuses a query until it is configured for it, such as a Firestore index. */
declare class UnsupportedQueryError extends Error {
  readonly name: 'UnsupportedQueryError'
  readonly reason: string
  constructor (reason: string)
}

declare function isDocumentNotFound (error: unknown): boolean

export {
  DocumentNotFoundError,
  UnsupportedQueryError,
  isDocumentNotFound
}

export type {
  Adapter
}
export type {
  JsonSchema,
  CollectionReference,
  DocumentReference,
  Comparable,
  Condition,
  QueryParams,
  Document,
  DocumentSnapshot,
  UpdateSnapshot,
  CollectionPage
} from './types.d.ts'
