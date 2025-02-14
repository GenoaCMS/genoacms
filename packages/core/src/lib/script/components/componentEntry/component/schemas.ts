import type { JSONSchemaType } from 'ajv'
import type {
  BooleanAttribute,
  ComponentEntryAttributes,
  ComponentsAttribute,
  LinkAttribute,
  MarkdownAttribute,
  NumberAttribute,
  RichTextAttribute,
  StorageResourceAttribute,
  StringAttribute,
  TextAttribute
} from './types'

const booleanAttributeSchema: JSONSchemaType<BooleanAttribute> = {
  type: 'object',
  properties: {
    uid: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string' },
    isRequired: { type: 'boolean' },
    type: {
      type: 'string',
      const: 'boolean'
    },
    defaultValue: { type: 'boolean' }
  },
  required: ['uid', 'name', 'type']
}

const numberAttributeSchema: JSONSchemaType<NumberAttribute> = {
  type: 'object',
  properties: {
    uid: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string' },
    isRequired: { type: 'boolean' },
    type: {
      type: 'string',
      const: 'number'
    },
    defaultValue: { type: 'number' },
    min: { type: 'number' },
    max: { type: 'number' },
    step: { type: 'number' },
    decimalPlaces: { type: 'number' }
  },
  required: ['uid', 'name', 'type']
}

const stringAttributeSchema: JSONSchemaType<StringAttribute> = {
  type: 'object',
  properties: {
    uid: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string' },
    isRequired: { type: 'boolean' },
    type: {
      type: 'string',
      const: 'string'
    },
    defaultValue: { type: 'string' },
    regex: { type: 'string' },
    maxLength: { type: 'number' }
  },
  required: ['uid', 'name', 'type']
}

const textAttributeSchema: JSONSchemaType<TextAttribute> = {
  type: 'object',
  properties: {
    uid: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string' },
    isRequired: { type: 'boolean' },
    type: {
      type: 'string',
      const: 'text'
    },
    defaultValue: { type: 'string' },
    maxLength: { type: 'number' }
  },
  required: ['uid', 'name', 'type']
}

const markdownAttributeSchema: JSONSchemaType<MarkdownAttribute> = {
  type: 'object',
  properties: {
    uid: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string' },
    isRequired: { type: 'boolean' },
    type: {
      type: 'string',
      const: 'markdown'
    },
    defaultValue: { type: 'string' }
  },
  required: ['uid', 'name', 'type']
}

const richTextAttributeSchema: JSONSchemaType<RichTextAttribute> = {
  type: 'object',
  properties: {
    uid: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string' },
    isRequired: { type: 'boolean' },
    type: {
      type: 'string',
      const: 'richText'
    },
    defaultValue: { type: 'string' }
  },
  required: ['uid', 'name', 'type']
}

const linkAttributeSchema: JSONSchemaType<LinkAttribute> = {
  type: 'object',
  properties: {
    uid: { type: 'string' },
    name: { type: 'string' },
    description: { type: 'string' },
    isRequired: { type: 'boolean' },
    type: {
      type: 'string',
      const: 'link'
    }
  },
  required: ['uid', 'name', 'type']
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
  componentEntrySchema
}
