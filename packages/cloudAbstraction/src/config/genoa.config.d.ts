import type { AuthenticationProvider } from '../services/authentication/index.d'
import type { DatabaseInit, DatabaseProvider } from '../services/database/index.d'
import type { BucketInit, StorageProvider } from '../services/storage/index.d'
import type { DeploymentProvider } from '../services/deployment/index.js'
import type { SecretProvider } from '../services/secrets/index.d'

type Config<Extension extends object = object> = Extension & {
  authentication: {
    providers: AuthenticationProvider[]
    cookieName: string
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
     * Default lifetime of a subordinate signing key, in days.
     *
     * Tier-1 supplies the *default*; the live value lives in the signed security policy document
     * (`.genoacms/security/policy.json`), which this seeds at first start. Declared here rather
     * than embedded in code so no limit is a constant.
     */
    subordinateKeyRotationDays?: number
    /**
     * Roles declared before deployment, as role name to grants.
     *
     * **Authoritative, not seeding.** A role declared here is immutable at runtime: an attempt to
     * alter or remove it through the CMS is refused when it is made. Runtime administration may
     * still create roles this does not name.
     *
     * Declarations are merged when authorization is read, never written into `roles.json`. Deleting
     * a role from here therefore removes it — and revokes the access it granted — rather than
     * leaving an editable copy behind in storage.
     */
    roles?: Record<string, Array<{ permission: string, resource: unknown }>>
    /**
     * Role assignments declared before deployment, as subject to role names.
     *
     * Immutable at runtime on the same terms as `roles`, and resolved **without consulting
     * storage** — which is what makes an instance recoverable when its `users.json` is absent or
     * fails verification. Every subject named here can act on such an instance; nobody else can.
     *
     * This replaces the former `adminSubject`. A seed administrator is now an ordinary declared
     * assignment carrying a role with full authority, rather than an identity special-cased ahead
     * of the authorization data.
     */
    assignments?: Record<string, string[]>
    /**
     * Refuses **all** runtime role and assignment administration when true.
     *
     * For instances whose authorization should be fixed at deployment. Independent of the
     * immutability above, which applies only to what this file declares: with this set, even roles
     * created at runtime can no longer be changed.
     */
    lockRoles?: boolean
    /** Access token lifetime in minutes. Seeds the security policy document. */
    accessTokenMinutes?: number
    /**
     * How long resolved grants are cached per subject, in seconds.
     *
     * The window during which a revoked permission is still honoured. Seeds the policy document.
     */
    grantCacheSeconds?: number
    /** Refresh token lifetime in days. Seeds the security policy document. */
    refreshTokenDays?: number
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
