import type { AuthorizationProvider } from '../services/authorization/index.d.ts'
import type { AuthenticationProvider } from '../services/authentication/index.d'
import type { DatabaseInit, DatabaseProvider } from '../services/database/index.d'
import type { BucketInit, StorageProvider } from '../services/storage/index.d'
import type { DeploymentProvider } from '../services/deployment/index.js'

type Config<Extension extends object = object> = Extension & {
  authorization: {
    providers: AuthorizationProvider[]
  }
  authentication: {
    providers: AuthenticationProvider[]
    cookieName: string
    JWTSecret: string
  }
  database: {
    databases: DatabaseInit[]
    providers: DatabaseProvider[]
  }
  deployment: {
    providers: DeploymentProvider[]
  }
  storage: {
    defaultBucket: string
    buckets: BucketInit[]
    providers: StorageProvider[]
  }
  [key: string]: any
}

type Provider = AuthorizationProvider
| AuthenticationProvider
| DatabaseProvider
| StorageProvider
| DeploymentProvider

export type {
  Config,
  Provider
}
