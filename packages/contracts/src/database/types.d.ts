/**
 * A JSON Schema object. The contract carries schemas and never validates them, so it names the
 * keywords code reads and admits every other.
 */
interface JsonSchema {
  type?: string | string[]
  properties?: Record<string, JsonSchema>
  [keyword: string]: unknown
}

interface CollectionReference {
  name: string
  primaryKey: {
    key: string,
    schema: JsonSchema
  },
  schema: JsonSchema
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
type Document<C extends CollectionReference = CollectionReference> = Record<keyof C['schema'], C['schema'][keyof C['schema']]>
interface DocumentSnapshot<C extends CollectionReference> {
  reference: DocumentReference<C>
  data: Document<C>
}
interface UpdateSnapshot<C extends CollectionReference> extends Omit<DocumentSnapshot<C>, 'data'> {
  data: Partial<Document<C>>
}
type CollectionSnapshot<C extends CollectionReference> = Array<DocumentSnapshot<C>> // TODO: make class, method docs()

export type {
  JsonSchema,
  CollectionReference,
  DocumentReference,
  QueryParams,
  Document,
  DocumentSnapshot,
  UpdateSnapshot,
  CollectionSnapshot
}
