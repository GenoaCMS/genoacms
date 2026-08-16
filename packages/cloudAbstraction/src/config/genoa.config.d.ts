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
     * Default lifetime of a subordinate signing key, in days.
     *
     * Tier-1 supplies the *default*; the live value lives in the signed security policy document
     * (`.genoacms/security/policy.json`), which this seeds at first start. Declared here rather
     * than embedded in code so no limit is a constant.
     */
    subordinateKeyRotationDays?: number
    /**
     * Roles written into `roles.json` at first start.
     *
     * Seeding only: the manifest owns them afterwards, so an administrator editing a role at
     * runtime does not find it reverted by the next deployment. Shaped as the manifest is —
     * role name to grants.
     */
    roles?: Record<string, Array<{ permission: string, resource: unknown }>>
    /** Access token lifetime in minutes. Seeds the security policy document. */
    accessTokenMinutes?: number
    /**
     * How long resolved grants are cached per subject, in seconds.
     *
     * The window during which a revoked permission is still honoured. Seeds the policy document.
     */
    grantCacheSeconds?: number
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
