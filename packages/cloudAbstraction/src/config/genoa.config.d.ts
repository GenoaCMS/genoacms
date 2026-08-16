import type { AuthenticationProvider } from '../services/authentication/index.d'
import type { DatabaseInit, DatabaseProvider } from '../services/database/index.d'
import type { BucketInit, StorageProvider } from '../services/storage/index.d'
import type { DeploymentProvider } from '../services/deployment/index.js'

type Config<Extension extends object = object> = Extension & {
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
  security: {
    /**
     * Subject of the seed administrator. Tier-1 configuration is the root of authority:
     * this identity is authorized without consulting any storage manifest, and is the only
     * one that can act before verified manifests exist.
     */
    adminSubject: string
    /**
     * What to do with an authorization manifest whose signature could not be verified.
     *
     * Defaults to `'accept-unsigned'` while manifest signing is not yet implemented. Becomes
     * `'require-signature'` once the secrets service and key hierarchy exist.
     */
    manifestTrust?: 'accept-unsigned' | 'require-signature'
  }
  storage: {
    defaultBucket: string
    buckets: BucketInit[]
    providers: StorageProvider[]
  }
  [key: string]: any
}

type Provider = AuthenticationProvider
| DatabaseProvider
| StorageProvider
| DeploymentProvider

export type {
  Config,
  Provider
}
