---
title: Database types
---

## Core

```ts
import type { JSONSchemaType } from 'ajv'

interface CollectionReference {
  name: string
  primaryKey: {
    key: string
    schema: JSONSchemaType<any>
  }
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
  order?: {
    field: string
    direction: 'asc' | 'desc'
  }
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
  CollectionReference,
  DocumentReference,
  QueryParams,
  Document,
  DocumentSnapshot,
  UpdateSnapshot,
  CollectionSnapshot
}
```

## Adapter

```ts
import type { CollectionReference, Document, DocumentReference, DocumentSnapshot, CollectionSnapshot, UpdateSnapshot, QueryParams } from './types.d.ts'

type createDocument = <C extends CollectionReference>(reference: C, document: Document<C>) => Promise<DocumentSnapshot<C>>

type getCollection = <C extends CollectionReference>(reference: C, queryParams?: QueryParams) => Promise<CollectionSnapshot<C>>
type getDocument = <C extends CollectionReference, D extends DocumentReference<C>>(reference: D) => Promise<DocumentSnapshot<C> | undefined>

type updateDocument = <C extends CollectionReference, D extends DocumentReference<C>>(reference: D, document: Document<C>) => Promise<UpdateSnapshot<C>>

type deleteDocument = <C extends CollectionReference, D extends DocumentReference<C>>(reference: D) => Promise<void>

interface Adapter {
  createDocument: createDocument

  getCollection: getCollection
  getDocument: getDocument

  updateDocument: updateDocument

  deleteDocument: deleteDocument
}

export default Adapter
```

## Module

```ts
import type Adapter from './adapter.d.ts'
import type {
  CollectionReference,
  Document
} from './types.d.ts'

declare module '@genoacms/adapter-*/database' {
  import type Adapter from './adapter.d'
  const createDocument: Adapter.createDocument
  const getCollection: Adapter.getCollection
  const getDocument: Adapter.getDocument
  const updateDocument: Adapter.updateDocument
  const deleteDocument: Adapter.deleteDocument
  export {
    createDocument,
    getCollection,
    getDocument,
    updateDocument,
    deleteDocument
  }
}

interface DatabaseInit {
  providerName: string
  collections: CollectionReference[]
  testDocuments?: [Document, Document]
}

type DatabaseProvider<Extension extends object = object> = Extension & {
  name: string
  adapter: Promise<Adapter>
}

export type {
  Adapter,
  DatabaseInit,
  DatabaseProvider
}
```
