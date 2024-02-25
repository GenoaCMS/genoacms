import type { JSONSchemaType } from 'ajv'
import type {
  BooleanAttributeValue,
  ComponentsAttributeValue,
  LinkAttributeValue,
  MarkdownAttributeValue,
  NumberAttributeValue,
  RichTextAttributeValue,
  StorageResourceAttributeValue,
  StringAttributeValue,
  TextAttributeValue
} from '$lib/script/components/componentEntry/attribute/types'

const booleanValueSchema: JSONSchemaType<BooleanAttributeValue> = {
  type: 'boolean'
}

const numberValueSchema: JSONSchemaType<NumberAttributeValue> = {
  type: 'number'
}

const stringValueSchema: JSONSchemaType<StringAttributeValue> = {
  type: 'string'
}

const textValueSchema: JSONSchemaType<TextAttributeValue> = stringValueSchema
const markdownValueSchema: JSONSchemaType<MarkdownAttributeValue> = stringValueSchema
const richTextValueSchema: JSONSchemaType<RichTextAttributeValue> = stringValueSchema

const linkValueSchema: JSONSchemaType<LinkAttributeValue> = {
  type: 'object',
  properties: {
    isExternal: { type: 'boolean' },
    url: { type: 'string', nullable: true },
    pageName: { type: 'string', nullable: true }
  },
  required: ['isExternal']
}

const storageResourceValueSchema: JSONSchemaType<StorageResourceAttributeValue> = {
  type: 'object',
  properties: {
    bucket: { type: 'string' },
    name: { type: 'string' }
  },
  required: ['bucket', 'name']
}

const componentsValueSchema: JSONSchemaType<ComponentsAttributeValue> = {
  type: 'array',
  items: {
    type: 'string',
    enum: []
  }
}

export {
  booleanValueSchema,
  numberValueSchema,
  stringValueSchema,
  textValueSchema,
  markdownValueSchema,
  richTextValueSchema,
  linkValueSchema,
  storageResourceValueSchema,
  componentsValueSchema
}
