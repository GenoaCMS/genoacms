import type { JSONSchemaType } from 'ajv'

interface CollectionReference {
  name: string
  schema: JSONSchemaType<any>
}
interface DocumentReference<C extends CollectionReference> {
  collection: C
  id: string
}
type Document<C extends CollectionReference> = Record<keyof C, C[keyof C]>
type Collection<C extends CollectionReference> = Array<Document<C>>

type createDocument = <C extends CollectionReference>(reference: C, document: Document<C>) => Promise<DocumentReference<C>>

type getCollection = <C extends CollectionReference>(reference: C) => Promise<Collection<C>>
type getDocument = <C extends CollectionReference, D extends DocumentReference<C>>(reference: D) => Promise<Document<C>>

type updateDocument = <C extends CollectionReference>(reference: C, document: Document<C>) => Promise<DocumentReference<C>>

type deleteDocument = <C extends CollectionReference>(reference: C, document: Document<C>) => Promise<void>

export type {
  CollectionReference,
  DocumentReference,
  Collection,
  Document,
  createDocument,
  getCollection,
  getDocument,
  updateDocument,
  deleteDocument
}
