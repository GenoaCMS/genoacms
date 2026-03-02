import type { Schema } from '@exodus/schemasafe'

const booleanValueSchema: Schema = {
  type: 'boolean'
}

const numberValueSchema: Schema = {
  type: 'number'
}

const stringValueSchema: Schema = {
  type: 'string'
}

const textValueSchema: Schema = stringValueSchema
const markdownValueSchema: Schema = stringValueSchema
const richTextValueSchema: Schema = stringValueSchema

const linkValueSchema: Schema = {
  type: 'object',
  properties: {
    isExternal: { type: 'boolean' },
    url: { type: 'string', nullable: true },
    pageName: { type: 'string', nullable: true }
  },
  required: ['isExternal']
}

const storageResourceValueSchema: Schema = {
  type: 'object',
  properties: {
    bucket: { type: 'string' },
    name: { type: 'string' }
  },
  required: ['bucket', 'name']
}

const componentsValueSchema: Schema = {
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
