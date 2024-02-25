import type { attributeType, attributeValue } from '$lib/script/components/componentEntry/types'
import type { JSONSchemaType } from 'ajv'
import { listOrCreatePreBuiltComponentList } from './component.server'
import {
  booleanValueSchema,
  componentsValueSchema,
  linkValueSchema,
  numberValueSchema,
  storageResourceValueSchema,
  stringValueSchema
} from '$lib/script/components/componentEntry/schemas'
import type { AttributeValue } from '$lib/script/components/page/entry/types'

const attributeTypeToValueSchema = async (type: attributeType): Promise<JSONSchemaType<AttributeValue>> => {
  switch (type) {
    case 'boolean':
      return booleanValueSchema
    case 'number':
      return numberValueSchema
    case 'string':
    case 'text':
    case 'markdown':
    case 'richText':
      return stringValueSchema
    case 'link':
      return linkValueSchema
    case 'storageResource':
      return storageResourceValueSchema
    case 'components': {
      const schema = componentsValueSchema
      const availableComponents = await listOrCreatePreBuiltComponentList()
      schema.enum = availableComponents.map(component => component.name)
      return schema
    }
    default:
      throw new Error('invalid-attribute-type')
  }
}

const attributeToSchema = async (attribute: attributeValue) => {
  const schema = await attributeTypeToValueSchema(attribute.type)
  if (attribute.isRequired) schema.nullable = false
  if ('min' in attribute) schema.minimum = attribute.min
  if ('max' in attribute) schema.maximum = attribute.max
  if ('step' in attribute) schema.multipleOf = attribute.step
  if ('decimalPlaces' in attribute) schema.multipleOf = 1 / (10 ** attribute.decimalPlaces)
  if ('regex' in attribute) schema.pattern = attribute.regex
  if ('maxLength' in attribute) schema.maxLength = attribute.maxLength
  if ('allowedComponents' in attribute) schema.items.enum = schema.items.enum.filter((component: string) => attribute.allowedComponents.includes(component))
  return schema
}

export {
  attributeToSchema
}
