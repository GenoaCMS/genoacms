import type { JSONSchemaType } from 'ajv'

interface Collection {
  name: string
  schema: JSONSchemaType<any>
}

export type {
  Collection
}
