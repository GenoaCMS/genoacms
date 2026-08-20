/**
 * The shape of the grantable-resource catalogue.
 *
 * Pure, and deliberately not in `user.server`: the administration screen needs these types to render
 * the resource and field pickers, and a component may not import a server module to get them. The
 * service that fills the catalogue, and the permission governing who may see it, live in
 * `configuration/user.server`.
 */

/** A collection, with the fields a `read` or `write` grant over it can name. */
interface GrantableCollection {
  name: string
  /**
   * The collection's field names, in schema order.
   *
   * Empty when the collection declares no properties, or when its definition could not be read —
   * the two are indistinguishable here on purpose. A catalogue that failed loudly on one unreadable
   * collection would take the whole administration screen down with it, and the grant editor still
   * has something useful to offer for every other collection.
   */
  fields: string[]
}

interface GrantableResources {
  /** Bucket names, from Tier-1 configuration, and therefore complete. */
  buckets: string[]
  /** Collections as they stood at startup — one created since is absent until restart. */
  collections: GrantableCollection[]
}

export type {
  GrantableCollection,
  GrantableResources
}
