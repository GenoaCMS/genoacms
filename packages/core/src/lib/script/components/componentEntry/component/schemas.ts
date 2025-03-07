import type { JSONSchemaType } from 'ajv'
import type {
  BooleanAttribute,
  BooleanMetaSchema,
  ComponentEntryCreation,
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
    type: { type: 'string', const: 'boolean' },
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
    type: { type: 'string', const: 'number' },
    title: { type: 'string' },
    description: { type: 'string' },
    minimum: { type: ['number', 'null'] },
    maximum: { type: ['number', 'null'] },
    multipleOf: { type: ['number', 'null'] },
    required: { type: 'boolean' },
    default: { type: ['number', 'null'] }
  },
  required: ['type', 'title', 'description', 'required', 'default']
}

const stringMetaSchema: JSONSchemaType<StringMetaSchema> = {
  type: 'object',
  properties: {
    type: { type: 'string', const: 'string' },
    title: { type: 'string' },
    description: { type: 'string', default: '' },
    minLength: { type: ['number', 'null'] },
    maxLength: { type: ['number', 'null'] },
    pattern: { type: 'string', default: '' },
    format: { type: 'string', default: '' },
    required: { type: 'boolean' },
    default: { type: 'string', default: '' }
  },
  required: ['type', 'title']
}

const componentsAttributeMetaSchema: JSONSchemaType<ComponentsAttributeMetaSchema> = {
  type: 'object',
  properties: {
    type: { type: 'string', const: 'array' },
    title: { type: 'string' },
    description: { type: 'string' },
    items: {
      type: 'object',
      properties: {
        type: { type: 'string', const: 'string' },
        enum: { type: 'array', items: { type: 'string' } }
      },
      required: ['type']
    },
    default: { type: ['array', 'null'] },
    minItems: { type: ['number', 'null'] },
    maxItems: { type: ['number', 'null'] },
    required: { type: 'boolean' }
  },
  required: ['type', 'title', 'items', 'required']
}

const booleanAttributeSchema: JSONSchemaType<BooleanAttribute> = {
  type: 'object',
  properties: {
    uid: { type: 'string' },
    type: { type: 'string', const: 'boolean' },
    schema: booleanMetaSchema
  },
  required: ['uid', 'type', 'schema']
}

const numberAttributeSchema: JSONSchemaType<NumberAttribute> = {
  type: 'object',
  properties: {
    uid: { type: 'string' },
    type: { type: 'string', const: 'number' },
    schema: numberMetaSchema,
    decimalPlaces: { type: 'number' }
  },
  required: ['uid', 'type', 'schema']
}

const stringAttributeSchema: JSONSchemaType<StringAttribute> = {
  type: 'object',
  properties: {
    uid: { type: 'string' },
    type: { type: 'string', const: 'string' },
    schema: stringMetaSchema
  },
  required: ['uid', 'type', 'schema']
}

const textAttributeSchema: JSONSchemaType<TextAttribute> = {
  type: 'object',
  properties: {
    uid: { type: 'string' },
    type: { type: 'string', const: 'text' },
    schema: stringMetaSchema
  },
  required: ['uid', 'type', 'schema']
}

const markdownAttributeSchema: JSONSchemaType<MarkdownAttribute> = {
  type: 'object',
  properties: {
    uid: { type: 'string' },
    type: { type: 'string', const: 'markdown' },
    schema: stringMetaSchema
  },
  required: ['uid', 'type', 'schema']
}

const richTextAttributeSchema: JSONSchemaType<RichTextAttribute> = {
  type: 'object',
  properties: {
    uid: { type: 'string' },
    type: { type: 'string', const: 'richText' },
    schema: stringMetaSchema
  },
  required: ['uid', 'type', 'schema']
}

const linkAttributeSchema: JSONSchemaType<LinkAttribute> = {
  type: 'object',
  properties: {
    uid: { type: 'string' },
    type: { type: 'string', const: 'link' },
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
    type: {
      type: 'string',
      const: 'components'
    },
    schema: componentsAttributeMetaSchema
  },
  required: ['uid', 'type', 'schema']
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

const componentEntryCreationSchema: JSONSchemaType<ComponentEntryCreation> = {
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
