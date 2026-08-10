import type { Schema } from '@exodus/schemasafe'

/**
 * JSON Schema allows a schema to be the literal `true` or `false` as well as an
 * object, so `@exodus/schemasafe` types `Schema` as `true | false | { ... }`.
 * Nothing in the CMS produces or consumes a boolean schema — collection and
 * attribute schemas are always objects — but the union makes every keyword
 * access (`schema.type`, `schema.items`, …) a type error.
 *
 * Use this wherever a schema is known to be an object.
 */
type SchemaObject = Exclude<Schema, boolean>

/**
 * Narrow a nested schema — `items`, a `properties` value, a `oneOf` member — to
 * its object form. Returns undefined when it is absent, a boolean schema, or a
 * tuple (`items` may be an array in JSON Schema; the CMS never uses that form).
 */
function asSchemaObject (schema: Schema | Schema[] | undefined): SchemaObject | undefined {
  if (schema === undefined || typeof schema === 'boolean' || Array.isArray(schema)) return undefined
  return schema
}

export { asSchemaObject }
export type { SchemaObject }
