import type { Schema } from '@exodus/schemasafe'

const booleanMetaSchema: Schema = {
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

const numberMetaSchema: Schema = {
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

const stringMetaSchema: Schema = {
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

const linkMetaSchema: Schema = {
  type: 'object',
  properties: {
    type: { type: 'string', const: 'object' },
    properties: {
      type: 'object',
      properties: {
        isExternal: {
          type: 'object',
          properties: { type: { type: 'string', const: 'boolean' } },
          required: ['type']
        },
        url: {
          type: 'object',
          properties: {
            type: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['string', 'null']
              }
            }
          },
          required: ['type']
        },
        pageName: {
          type: 'object',
          properties: {
            type: {
              type: 'array',
              items: {
                type: 'string',
                enum: ['string', 'null']
              }
            }
          },
          required: ['type']
        }
      }
    },
    required: {
      type: 'array',
      items: { type: 'string' }
    }
  },
  required: ['type', 'properties', 'required']
}

const linksMetaSchema: Schema = {
  type: 'object',
  properties: {
    type: { type: 'string', const: 'array' },
    title: { type: 'string' },
    description: { type: 'string' },
    items: linkMetaSchema,
    default: { type: ['array', 'null'], items: linkMetaSchema },
    minItems: { type: ['number', 'null'] },
    maxItems: { type: ['number', 'null'] },
    required: { type: 'boolean' }
  },
  required: ['type', 'title']
}

const storageResourceMetaSchema: Schema = {
  type: 'object',
  properties: {
    type: { type: 'string', const: 'object' },
    properties: {
      type: 'object',
      properties: {
        bucket: {
          type: 'object',
          properties: { type: { type: 'string', const: 'string' } },
          required: ['type']
        },
        name: {
          type: 'object',
          properties: { type: { type: 'string', const: 'string' } },
          required: ['type']
        }
      }
    },
    required: {
      type: 'array',
      items: { type: 'string', enum: ['bucket', 'name'] }
    }
  },
  required: ['type', 'properties', 'required']
}

const storageResourcesMetaSchema: Schema = {
  type: 'object',
  properties: {
    type: { type: 'string', const: 'array' },
    title: { type: 'string' },
    description: { type: 'string' },
    items: storageResourceMetaSchema,
    default: { type: ['array', 'null'], items: storageResourceMetaSchema },
    minItems: { type: ['number', 'null'] },
    maxItems: { type: ['number', 'null'] },
    required: { type: 'boolean' }
  },
  required: ['type', 'title']
}

const componentsAttributeMetaSchema: Schema = {
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

const booleanAttributeSchema: Schema = {
  type: 'object',
  properties: {
    uid: { type: 'string' },
    type: { type: 'string', const: 'boolean' },
    schema: booleanMetaSchema
  },
  required: ['uid', 'type', 'schema']
}

const numberAttributeSchema: Schema = {
  type: 'object',
  properties: {
    uid: { type: 'string' },
    type: { type: 'string', const: 'number' },
    schema: numberMetaSchema,
    decimalPlaces: { type: 'number' }
  },
  required: ['uid', 'type', 'schema']
}

const stringAttributeSchema: Schema = {
  type: 'object',
  properties: {
    uid: { type: 'string' },
    type: { type: 'string', const: 'string' },
    schema: stringMetaSchema
  },
  required: ['uid', 'type', 'schema']
}

const textAttributeSchema: Schema = {
  type: 'object',
  properties: {
    uid: { type: 'string' },
    type: { type: 'string', const: 'text' },
    schema: stringMetaSchema
  },
  required: ['uid', 'type', 'schema']
}

const markdownAttributeSchema: Schema = {
  type: 'object',
  properties: {
    uid: { type: 'string' },
    type: { type: 'string', const: 'markdown' },
    schema: stringMetaSchema
  },
  required: ['uid', 'type', 'schema']
}

const richTextAttributeSchema: Schema = {
  type: 'object',
  properties: {
    uid: { type: 'string' },
    type: { type: 'string', const: 'richText' },
    schema: stringMetaSchema
  },
  required: ['uid', 'type', 'schema']
}

const linkAttributeSchema: Schema = {
  type: 'object',
  properties: {
    uid: { type: 'string' },
    type: { type: 'string', const: 'link' },
    schema: linksMetaSchema
  },
  required: ['uid', 'type', 'schema']
}

const storageResourceAttributeSchema: Schema = {
  type: 'object',
  properties: {
    uid: { type: 'string' },
    type: {
      type: 'string',
      const: 'storageResource'
    },
    schema: storageResourcesMetaSchema
  },
  required: ['uid', 'type', 'schema']
}

const componentsAttributeSchema: Schema = {
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

const componentEntryAttributesSchema: Schema = {
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

const componentEntrySchema: Schema = {
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

const componentEntryCreationSchema: Schema = {
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
  linksMetaSchema,
  storageResourcesMetaSchema,
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
