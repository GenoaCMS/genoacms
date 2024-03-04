import type * as AuthorizationAdapter from '@genoacms/adapter/authorization'
import type * as AuthenticationAdapter from '@genoacms/adapter/authentication'
import type * as DatabaseAdapter from '@genoacms/adapter/database'
import type * as StorageAdapter from '@genoacms/adapter/storage'
import type { CollectionReference, Document } from './services/database/index.d.ts'

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
