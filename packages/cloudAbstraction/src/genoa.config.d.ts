import type { Adapter as AuthorizationAdapter } from './services/authorization/index.d.ts'
import type { Adapter as AuthenticationAdapter } from './services/authentication/index.d.ts'
import type { Adapter as DatabaseAdapter, CollectionReference, Document } from './services/database/index.d'
import type { Adapter as StorageAdapter } from './services/storage/index.d'

interface Config<AuthExtension extends object = object,
    AuthenticationExtension extends object = object,
    DatabaseExtension extends object = object,
    StorageExtension extends object = object> {
  authorization: {
    adapter: Promise<typeof AuthorizationAdapter>
  } & AuthExtension
  authentication: {
    adapter: Promise<typeof AuthenticationAdapter>
  } & AuthenticationExtension
  database: {
    adapter: Promise<typeof DatabaseAdapter>
    [key: string]: any
  } & DatabaseExtension
  storage: {
    adapter: Promise<typeof StorageAdapter>
    testBucket?: string
    [key: string]: any
  } & StorageExtension
  collections: CollectionReference[]
  testDocuments?: [Document, Document]
  [key: string]: any
}

export default Config
