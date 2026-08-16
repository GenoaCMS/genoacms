import type { AuthenticationProvider } from '../services/authentication/index.d'
import type { DatabaseInit, DatabaseProvider } from '../services/database/index.d'
import type { BucketInit, StorageProvider } from '../services/storage/index.d'
import type { DeploymentProvider } from '../services/deployment/index.js'
import type { SecretProvider, SecretReference } from '../services/secrets/index.d'

type Config<Extension extends object = object> = Extension & {
  authentication: {
    providers: AuthenticationProvider[]
    cookieName: string
    /**
     * A reference to the session-signing key held in the secrets service — never the key itself.
     * `genoa.config` is committed to a repository, so a literal here is a credential in version
     * control, and one that signs every session token.
     */
    JWTSecret: SecretReference
  }
  database: {
    databases: DatabaseInit[]
    providers: DatabaseProvider[]
  }
  deployment: {
    providers: DeploymentProvider[]
  }
  secrets: {
    /** Exactly one. A secret store is a single authority — see the secrets service reference. */
    providers: SecretProvider[]
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
| SecretProvider
| DatabaseProvider
| StorageProvider
| DeploymentProvider

export type {
  Config,
  Provider
}
