import type { Adapter as AuthorizationAdapter } from './services/authorization/index.d.ts'
import type { Adapter as AuthenticationAdapter } from './services/authentication/index.d.ts'
import type { Adapter as DatabaseAdapter, CollectionReference, Document } from './services/database/index.d'
import type { BucketInit } from './services/storage/index.d'

interface Config<AuthorizationExtension extends object = object,
    AuthenticationExtension extends object = object,
    DatabaseExtension extends object = object,
    DeploymentExtension extends object = object,
    StorageExtension extends object = object> {
  authorization: {
    adapter: Promise<typeof AuthorizationAdapter>
  } & AuthorizationExtension
  authentication: {
    adapter: Promise<typeof AuthenticationAdapter>
  } & AuthenticationExtension
  database: {
    adapter: Promise<typeof DatabaseAdapter>
  } & DatabaseExtension
  deployment: {
    adapterPath: string
  } & DeploymentExtension
  storage: {
    buckets: BucketInit[]
    defaultBucket: string
  } & StorageExtension
  collections: CollectionReference[]
  testDocuments?: [Document, Document]
  [key: string]: any
}

export default Config
