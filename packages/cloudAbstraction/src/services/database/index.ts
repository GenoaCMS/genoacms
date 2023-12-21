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
type Document<C extends CollectionReference> = Record<keyof C['schema'], C['schema'][keyof C['schema']]> // TODO: verify whether this is correct
interface DocumentSnapshot<C extends CollectionReference, D extends DocumentReference<C>> {
  reference: D
  data: Document<C>
}
type CollectionSnapshot<C extends CollectionReference, D extends DocumentReference<C>> = Array<DocumentSnapshot<C, D>>

type createDocument = <C extends CollectionReference, D extends DocumentReference<C>>(reference: C, document: Document<C>) => Promise<DocumentSnapshot<C, D>>

type getCollection = <C extends CollectionReference, D extends DocumentReference<C>>(reference: C, queryParams?: QueryParams) => Promise<CollectionSnapshot<C, D>>
type getDocument = <C extends CollectionReference, D extends DocumentReference<C>>(reference: D) => Promise<DocumentSnapshot<C,D> | undefined>

type updateDocument = <C extends CollectionReference, D extends DocumentReference<C>>(reference: D, document: Document<C>) => Promise<DocumentSnapshot<C,D>>

type deleteDocument = <C extends CollectionReference, D extends DocumentReference<C>>(reference: D) => Promise<void>

export type {
  CollectionReference,
  DocumentReference,
  QueryParams,
  Document,
  DocumentSnapshot,
  CollectionSnapshot,

  createDocument,
  getCollection,
  getDocument,
  updateDocument,
  deleteDocument
}
