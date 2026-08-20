import type { CollectionReference } from '@genoacms/cloudabstraction/database'

/**
 * The field names a collection declares.
 *
 * A collection's shape is a JSON Schema, so its fields are the keys of `properties`. Pure and
 * separate from `database.server` so it can be tested without a storage adapter, and so the one
 * place that decides what counts as a field is shared by everything that asks.
 *
 * A schema with no `properties` — an empty collection definition, or one describing something other
 * than an object — yields no fields rather than throwing. The caller is offering a list to choose
 * from; having nothing to offer is a legitimate answer, being unable to render the screen is not.
 */
function collectionFields (reference: CollectionReference): string[] {
  const properties = reference.schema?.properties
  if (properties === undefined || properties === null || typeof properties !== 'object') return []
  return Object.keys(properties)
}

export {
  collectionFields
}
