import type { CollectionReference } from '@genoacms/contracts/database'
import type { Permission } from '@genoacms/internal/authorization'

/** One provider: which adapter descriptor, and that adapter's options. */
interface ProviderEntry<S extends string = string, O = unknown> {
  readonly adapter: S
  readonly options: O
}

/** Providers keyed by name. A record, so names are unique by construction. */
type Providers = Record<string, ProviderEntry>

/**
 * Tier-1 authorization: what this instance declares about who may do what.
 *
 * Separate from `security` because everything here is **authority** — re-read on every
 * resolution, never consumed — while `security` holds values that seed the Tier-2 policy document
 * once and are owned by it thereafter. Holding both in one stanza meant the difference had to be
 * explained per key; holding them apart lets the shape of the file say it.
 */
interface AuthorizationConfig {
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
  roles?: Record<string, Array<{ permission: Permission | '*', resource: unknown, fields?: string[] | '*' }>>
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
interface SecurityConfig {
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
   * The window during which a revoked permission is still honored.
   */
  grantCacheSeconds?: number
  /** Refresh token lifetime in days. */
  refreshTokenDays?: number
  /**
   * Loop iterations and recursive branches a dynamic component may spend in one render.
   *
   * A ceiling rather than a budget: it is compiled into each artifact and covered by its
   * signature, and a consumer may run below it but never above it.
   */
  maxFuel?: number
  /** How deep a dynamic component's recursive calls may nest. */
  maxDepth?: number
  /** Cumulative elements and bytes a dynamic component may ask for across one render. */
  maxAllocation?: number
  /**
   * The origins a dynamic component's data bridge may reach.
   *
   * Each an origin and nothing more — scheme, host and optional port. Empty by default, which
   * permits nothing: a bridge reaching everywhere until somebody narrowed it would be
   * indistinguishable from no bridge at all for as long as nobody noticed.
   */
  fetchOrigins?: string[]
}

interface Config<AP extends Providers, DP extends Providers, SP extends Providers,
  XP extends Providers, LP extends Providers, TP extends Providers> {
  authentication: {
    /** Tried in key order; the first `Identity` wins. */
    providers: AP
    cookieName: string
  }
  database: {
    providers: DP
    databases: Record<string, { provider: keyof DP & string, collections: CollectionReference[] }>
  }
  storage: {
    providers: SP
    buckets: Record<string, { provider: keyof SP & string }>
    defaultBucket: string
    /** Segment separator in storage browser URLs. Default `'|->'`. */
    pathDelimiter?: string
  }
  /** Exactly one provider. A secret store is a single authority; see @genoacms/contracts/secrets. */
  secrets: { providers: XP }
  /** Keyed by the language name a component records. */
  languages: { providers: LP }
  /** Optional: a config used only by the dev server needs no target. A build requires one. */
  deployment?: { targets: TP, default?: keyof TP & string }
  authorization: AuthorizationConfig
  security: SecurityConfig
}

/** Identity function. Exists so provider keys are inferred and cross-references are checked. */
function defineConfig<AP extends Providers, DP extends Providers, SP extends Providers,
  XP extends Providers, LP extends Providers, TP extends Providers> (
  config: Config<AP, DP, SP, XP, LP, TP>): Config<AP, DP, SP, XP, LP, TP> {
  return config
}

/** A loaded config: provider options are plain JSON, references collapsed to their `$…` objects. */
type SerializedConfig = Config<Providers, Providers, Providers, Providers, Providers, Providers>

export { defineConfig }
export type { Config, SerializedConfig, ProviderEntry, Providers, AuthorizationConfig, SecurityConfig }
