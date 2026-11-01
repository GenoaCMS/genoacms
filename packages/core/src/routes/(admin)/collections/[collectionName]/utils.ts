import type { CollectionReference } from '@genoacms/contracts/database'
import type { Schema } from '@exodus/schemasafe'
import type { SchemaObject } from '#lib/script/schema.js'

const keywordsOf = (schema: Schema) => typeof schema === 'object' ? schema : {}

const extractDocumentProperties = (reference: CollectionReference) => {
  const array = []
  const properties = reference.schema.properties
  for (const key in properties) {
    array.push({
      name: key,
      ...properties[key]
    })
  }
  return array
}

const extractProperties = (schema: SchemaObject) => {
  const properties = schema.properties ?? {}
  const array = []
  for (const key in properties) {
    array.push({
      name: key,
      ...keywordsOf(properties[key])
    })
  }
  return array
}

export {
  extractDocumentProperties,
  extractProperties
}
