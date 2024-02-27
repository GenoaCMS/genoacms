import type * as AuthorizationAdapter from './services/authorization'
import type * as ClientAuthenticationAdapter from './services/clientAuthentication'
import type * as DatabaseAdapter from './services/database'
import type * as StorageAdapter from './services/storage'

interface Config<AuthExtension extends object,
    ClientAuthenticationExtension extends object,
    DatabaseExtension extends object,
    StorageExtension extends object> {
  authorization: {
    adapter: Promise<AuthorizationAdapter>
  } & AuthExtension
  clientAuthentication: {
    adapter: Promise<ClientAuthenticationAdapter>
  } & ClientAuthenticationExtension
  database: {
    adapter: Promise<DatabaseAdapter>
    [key: string]: any
  } & DatabaseExtension
  storage: {
    adapter: Promise<StorageAdapter>
    testBucket?: string
    [key: string]: any
  } & StorageExtension
  collections: DatabaseAdapter.CollectionReference[]
  testDocuments?: [DatabaseAdapter.Document, DatabaseAdapter.Document]
  [key: string]: any
}

export default Config
