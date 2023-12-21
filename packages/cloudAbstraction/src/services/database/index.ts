import type { JSONSchemaType } from 'ajv'

interface CollectionReference {
  name: string
  primaryKey: string
  schema: JSONSchemaType<any>
}
interface DocumentReference<C extends CollectionReference> {
  collection: C
  id: string
}
interface QueryParams {
  startAfter?: {
    field: string
    value: string
  }
  limit?: number
  conditions?: [{
    field: string
    operator: string
    value: string
  }]
}
type Document<C extends CollectionReference> = Record<keyof C, C[keyof C]>
type Collection<C extends CollectionReference> = Array<Document<C>>

type createDocument = <C extends CollectionReference>(reference: C, document: Document<C>) => Promise<DocumentReference<C>>

type getCollection = <C extends CollectionReference>(reference: C, queryParams?: QueryParams) => Promise<Collection<C>>
type getDocument = <C extends CollectionReference, D extends DocumentReference<C>>(reference: D) => Promise<Document<C> | undefined>

type updateDocument = <C extends CollectionReference, D extends DocumentReference<C>>(reference: D, document: Document<C>) => Promise<DocumentReference<C>>

type deleteDocument = <C extends CollectionReference, D extends DocumentReference<C>>(reference: D) => Promise<void>

export type {
  CollectionReference,
  DocumentReference,
  Collection,
  QueryParams,
  Document,
  createDocument,
  getCollection,
  getDocument,
  updateDocument,
  deleteDocument
}
