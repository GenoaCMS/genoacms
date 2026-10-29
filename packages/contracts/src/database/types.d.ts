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
type Comparable = string | number | boolean | null
interface Condition {
  field: string
  operator: '==' | '!=' | '<' | '<=' | '>' | '>='
  value: Comparable
}
interface QueryParams {
  where?: Condition[]
  limit?: number
  pageToken?: string
}
type Document<C extends CollectionReference = CollectionReference> = Record<keyof C['schema'], C['schema'][keyof C['schema']]>
interface DocumentSnapshot<C extends CollectionReference> {
  reference: DocumentReference<C>
  data: Document<C>
}
interface UpdateSnapshot<C extends CollectionReference> extends Omit<DocumentSnapshot<C>, 'data'> {
  data: Partial<Document<C>>
}
interface CollectionPage<C extends CollectionReference> {
  documents: Array<DocumentSnapshot<C>>
  next?: string
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
}
