import type { AuthenticationProvider } from '../services/authentication/index.d'
import type { DatabaseInit, DatabaseProvider } from '../services/database/index.d'
import type { BucketInit, StorageProvider } from '../services/storage/index.d'
import type { DeploymentProvider } from '../services/deployment/index.js'
import type { SecretProvider } from '../services/secrets/index.d'
import type { Permission } from '../authorization/permissions.d'

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
  /**
   * Tier-1 authorization: what this instance declares about who may do what.
   *
   * Separate from `security` because everything here is **authority** — re-read on every
   * resolution, never consumed — while `security` holds values that seed the Tier-2 policy document
   * once and are owned by it thereafter. Holding both in one stanza meant the difference had to be
   * explained per key; holding them apart lets the shape of the file say it.
   */
  authorization: {
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
    roles?: Record<string, Array<{ permission: Permission, resource: unknown, fields?: string[] | '*' }>>
    /**
     * Role assignments declared before deployment, as subject to role names.
     *
     * Immutable at runtime on the same terms as `roles`, and resolved **without consulting
     * storage** — which is what makes an instance recoverable when its `users.json` is absent or
     * fails verification. Every subject named here can act on such an instance; nobody else can.
     *
     * The key is a subject as the authentication provider issues it, never an email address.
     */
    assignments?: Record<string, string[]>
    /**
     * Refuses **all** runtime role and assignment administration when true.
     *
     * For instances whose authorization should be fixed at deployment. Independent of the
     * immutability above, which applies only to what this file declares: with this set, even roles
     * created at runtime can no longer be changed.
     *
     * Declared here rather than under `security` because it governs exactly what this stanza
     * declares. In `security` it would be a switch deciding whether `authorization` may be edited,
     * pointing across the boundary these two stanzas exist to draw.
     */
    lockRoles?: boolean
  }
  /**
   * Tier-1 security defaults.
   *
   * Every value here **seeds** the signed security policy document at first start; the live values
   * live there afterwards, and editing this stanza does not move an instance that has already run.
   */
  security: {
    /**
     * Default lifetime of a subordinate signing key, in days.
     *
     * Declared here rather than embedded in code so that no limit is a constant.
     */
    subordinateKeyRotationDays?: number
    /** Access token lifetime in minutes. */
    accessTokenMinutes?: number
    /**
     * How long resolved grants are cached per subject, in seconds.
     *
     * The window during which a revoked permission is still honoured.
     */
    grantCacheSeconds?: number
    /** Refresh token lifetime in days. */
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
