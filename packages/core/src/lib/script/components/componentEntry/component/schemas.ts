import type { JSONSchemaType } from 'ajv'
import type {
  BooleanAttribute,
  ComponentEntry,
  ComponentsAttribute,
  LinkAttribute,
  MarkdownAttribute,
  NumberAttribute,
  PrebuiltComponentEntry,
  RichTextAttribute,
  StorageResourceAttribute,
  StringAttribute,
  TextAttribute
} from './types'

const booleanAttributeSchema: JSONSchemaType<BooleanAttribute> = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    isRequired: { type: 'boolean' },
    type: {
      type: 'string',
      const: 'boolean'
    },
    defaultValue: { type: 'boolean' }
  },
  required: ['name', 'type']
}

const numberAttributeSchema: JSONSchemaType<NumberAttribute> = {
  type: 'object',
  properties: {
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
  required: ['name', 'type']
}

const stringAttributeSchema: JSONSchemaType<StringAttribute> = {
  type: 'object',
  properties: {
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
  required: ['name', 'type']
}

const textAttributeSchema: JSONSchemaType<TextAttribute> = {
  type: 'object',
  properties: {
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
  required: ['name', 'type']
}

const markdownAttributeSchema: JSONSchemaType<MarkdownAttribute> = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    isRequired: { type: 'boolean' },
    type: {
      type: 'string',
      const: 'markdown'
    },
    defaultValue: { type: 'string' }
  },
  required: ['name', 'type']
}

const richTextAttributeSchema: JSONSchemaType<RichTextAttribute> = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    isRequired: { type: 'boolean' },
    type: {
      type: 'string',
      const: 'richText'
    },
    defaultValue: { type: 'string' }
  },
  required: ['name', 'type']
}

const linkAttributeSchema: JSONSchemaType<LinkAttribute> = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    isRequired: { type: 'boolean' },
    type: {
      type: 'string',
      const: 'link'
    }
  },
  required: ['name', 'type']
}

const storageResourceAttributeSchema: JSONSchemaType<StorageResourceAttribute> = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    isRequired: { type: 'boolean' },
    type: {
      type: 'string',
      const: 'storageResource'
    }
  },
  required: ['name', 'type']
}

const componentsAttributeSchema: JSONSchemaType<ComponentsAttribute> = {
  type: 'object',
  properties: {
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
  required: ['name', 'type']
}

const componentEntrySchema: JSONSchemaType<ComponentEntry> = {
  type: 'object',
  properties: {
    version: { type: 'string' },
    attributes: {
      type: 'array',
      items: {
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
      }
    }
  },
  required: ['version', 'attributes']
}

const prebuiltComponentEntrySchema: JSONSchemaType<PrebuiltComponentEntry> = {
  type: 'object',
  properties: {
    uid: { type: 'string' },
    name: { type: 'string' },
    versions: {
      type: 'object',
      additionalProperties: componentEntrySchema,
      required: []
    },
    currentVersion: { type: 'string' }
  },
  required: ['name', 'versions', 'currentVersion']
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
  componentEntrySchema,
  prebuiltComponentEntrySchema
}
