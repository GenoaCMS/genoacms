import type { JSONSchemaType } from 'ajv'
import type {
  BooleanAttribute,
  BooleanMetaSchema,
  ComponentCreation,
  ComponentEntryAttributes,
  ComponentsAttribute,
  LinkAttribute,
  MarkdownAttribute,
  NumberAttribute,
  NumberMetaSchema,
  RichTextAttribute,
  StorageResourceAttribute,
  StringAttribute,
  StringMetaSchema,
  TextAttribute
} from './types'

const booleanMetaSchema: JSONSchemaType<BooleanMetaSchema> = {
  type: 'object',
  properties: {
    type: { const: 'boolean' },
    title: { type: 'string' },
    description: { type: 'string' },
    required: { type: 'boolean' },
    default: { type: 'boolean' }
  },
  required: ['type', 'title', 'description', 'required', 'default']
}

const numberMetaSchema: JSONSchemaType<NumberMetaSchema> = {
  type: 'object',
  properties: {
    type: { const: 'number' },
    title: { type: 'string' },
    description: { type: 'string' },
    minimum: { type: 'number' },
    maximum: { type: 'number' },
    multipleOf: { type: 'number' },
    required: { type: 'boolean' },
    default: { type: 'number' }
  },
  required: ['type', 'title', 'description', 'required', 'default']
}

const stringMetaSchema: JSONSchemaType<StringMetaSchema> = {
  type: 'object',
  properties: {
    type: { const: 'string' },
    title: { type: 'string' },
    description: { type: 'string' },
    minLength: { type: 'number' },
    maxLength: { type: 'number' },
    pattern: { type: 'string' },
    format: { type: 'string' },
    required: { type: 'boolean' },
    default: { type: 'boolean' }
  }
}

const booleanAttributeSchema: JSONSchemaType<BooleanAttribute> = {
  type: 'object',
  properties: {
    uid: { type: 'string' },
    type: { const: 'boolean' },
    schema: booleanMetaSchema
  },
  required: ['uid', 'type', 'schema']
}

const numberAttributeSchema: JSONSchemaType<NumberAttribute> = {
  type: 'object',
  properties: {
    uid: { type: 'string' },
    type: { const: 'number' },
    schema: numberMetaSchema,
    decimalPlaces: { type: 'number' }
  },
  required: ['uid', 'type', 'schema']
}

const stringAttributeSchema: JSONSchemaType<StringAttribute> = {
  type: 'object',
  properties: {
    uid: { type: 'string' },
    type: { const: 'string' },
    schema: stringMetaSchema
  },
  required: ['uid', 'type', 'schema']
}

const textAttributeSchema: JSONSchemaType<TextAttribute> = {
  type: 'object',
  properties: {
    uid: { type: 'string' },
    type: { const: 'text' },
    schema: stringMetaSchema
  },
  required: ['uid', 'type', 'schema']
}

const markdownAttributeSchema: JSONSchemaType<MarkdownAttribute> = {
  type: 'object',
  properties: {
    uid: { type: 'string' },
    type: { const: 'markdown' },
    schema: stringMetaSchema
  },
  required: ['uid', 'type', 'schema']
}

const richTextAttributeSchema: JSONSchemaType<RichTextAttribute> = {
  type: 'object',
  properties: {
    uid: { type: 'string' },
    type: { const: 'richText' },
    schema: stringMetaSchema
  },
  required: ['uid', 'type', 'schema']
}

const linkAttributeSchema: JSONSchemaType<LinkAttribute> = {
  type: 'object',
  properties: {
    uid: { type: 'string' },
    type: { const: 'link' },
    schema: stringMetaSchema
  },
  required: ['uid', 'type', 'schema']
}

const storageResourceAttributeSchema: JSONSchemaType<StorageResourceAttribute> = {
  type: 'object',
  properties: {
    uid: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string' },
    isRequired: { type: 'boolean' },
    type: {
      type: 'string',
      const: 'storageResource'
    }
  },
  required: ['uid', 'name', 'type']
}

const componentsAttributeSchema: JSONSchemaType<ComponentsAttribute> = {
  type: 'object',
  properties: {
    uid: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string' },
    isRequired: { type: 'boolean' },
    type: {
      type: 'string',
      const: 'components'
    },
    component: { type: 'string' },
    maxComponents: { type: 'number' },
    allowedComponents: {
      type: 'array',
      items: { type: 'string' }
    }
  },
  required: ['uid', 'name', 'type']
}

const componentEntryAttributesSchema: JSONSchemaType<ComponentEntryAttributes> = {
  type: 'object',
  additionalProperties: {
    oneOf: [
      booleanAttributeSchema,
      numberAttributeSchema,
      stringAttributeSchema,
      textAttributeSchema,
      markdownAttributeSchema,
      richTextAttributeSchema,
      linkAttributeSchema,
      storageResourceAttributeSchema,
      componentsAttributeSchema
    ]
  },
  required: []
}

const componentEntrySchema: JSONSchemaType<ComponentEntry> = {
  type: 'object',
  properties: {
    uid: { type: 'string' },
    name: { type: 'string' },
    attributes: componentEntryAttributesSchema,
    history: {},
    future: {}
  },
  required: ['uid', 'name', 'attributes', 'history', 'future']
}

const componentEntryCreationSchema: JSONSchemaType<ComponentCreation> = {
  type: 'object',
  properties: {
    name: {
      type: 'string',
      minLength: 1
    }
  },
  required: ['name']
}

export {
  booleanAttributeSchema,
  numberAttributeSchema,
  stringAttributeSchema,
  textAttributeSchema,
  markdownAttributeSchema,
  richTextAttributeSchema,
  linkAttributeSchema,
  storageResourceAttributeSchema,
  componentsAttributeSchema,
  componentEntryAttributesSchema,
  componentEntrySchema,
  componentEntryCreationSchema
}
