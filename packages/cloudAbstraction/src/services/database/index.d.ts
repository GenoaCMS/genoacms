import type { Adapter, CollectionReference, Document } from './adapter.d'

interface DatabaseInit {
  providerName: string
  collections: CollectionReference[]
  testDocuments?: [Document, Document]
}

interface DatabaseProvider {
  name: string
  adapter: Promise<typeof Adapter>
}

export type {
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
} from './adapter.d'
