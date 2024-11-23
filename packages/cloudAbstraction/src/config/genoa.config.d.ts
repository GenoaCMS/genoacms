import type { AuthorizationProvider } from './services/authorization/index.d.ts'
import type { Adapter as AuthenticationAdapter } from './services/authentication/index.d.ts'
import type { DatabaseInit, DatabaseProvider } from './services/database/index.d'
import type { BucketInit } from './services/storage/index.d'

interface Config<AuthorizationExtension extends object = object,
    AuthenticationExtension extends object = object,
    DatabaseExtension extends object = object,
    DeploymentExtension extends object = object,
    StorageExtension extends object = object> {
  authorization: {
    providers: AuthorizationProvider[]
  } & AuthorizationExtension
  authentication: {
    adapter: Promise<typeof AuthenticationAdapter>
  } & AuthenticationExtension
  database: {
    databases: DatabaseInit[]
    providers: DatabaseProvider[]
  } & DatabaseExtension
  deployment: {
    adapterPath: string
  } & DeploymentExtension
  storage: {
    defaultBucket: string
    buckets: BucketInit[]
    providers: StorageProvider[]
  } & StorageExtension
  [key: string]: any
}

export default Config
