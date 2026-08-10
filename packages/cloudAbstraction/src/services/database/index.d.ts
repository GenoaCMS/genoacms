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
  adapterPath: string
  adapter: Promise<Adapter>
}

export type {
  Adapter,
  DatabaseInit,
  DatabaseProvider
}
export type {
  CollectionReference,
  DocumentReference,
  QueryParams,
  Document,
  DocumentSnapshot,
  UpdateSnapshot,
  CollectionSnapshot
} from './types.d.ts'
