/**
 * The shape of the grantable-resource catalogue.
 *
 * Pure, and deliberately not in `user.server`: the administration screen needs this type to render
 * the resource picker, and a component may not import a server module to get it. The service that
 * fills the catalogue, and the permission governing who may see it, live in
 * `configuration/user.server`.
 */
interface GrantableResources {
  /** Bucket names, from Tier-1 configuration, and therefore complete. */
  buckets: string[]
  /** Collection names as they stood at startup — one created since is absent until restart. */
  collections: string[]
}

export type {
  GrantableResources
}
