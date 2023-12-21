import type * as AuthAdapter from './services/auth'
import type * as DatabaseAdapter from './services/database'
import type * as StorageAdapter from './services/storage'

interface Config<AuthExtension extends object, DatabaseExtension extends object, StorageExtension extends object> {
  auth: {
    adapter: Promise<AuthAdapter>
  } & AuthExtension
  database: {
    adapter: Promise<DatabaseAdapter>
    [key: string]: any
  } & DatabaseExtension
  storage: {
    adapter: Promise<StorageAdapter>
    testingBucket?: string
    [key: string]: any
  } & StorageExtension
  collections: DatabaseAdapter.CollectionReference[]
  testDocuments?: [DatabaseAdapter.Document, DatabaseAdapter.Document]
  [key: string]: any
}

export default Config
