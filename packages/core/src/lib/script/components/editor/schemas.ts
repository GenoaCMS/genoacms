import type { Schema } from '@exodus/schemasafe'

const componentCreationSchema: Schema = {
  type: 'object',
  properties: {
    name: { type: 'string' }
  },
  required: ['name']
}

const componentDeletionSchema: Schema = {
  type: 'object',
  properties: {
    uid: { type: 'string', format: 'uuid' },
    name: { type: 'string' }
  },
  required: ['uid', 'name']
}

const componentSchema: Schema = {
  type: 'object',
  properties: {
    uid: { type: 'string', format: 'uuid' },
    name: { type: 'string' }
  },
  required: ['uid', 'name']
}

const codeChangeSchema: Schema = {}

const componentDefinitionSchema: Schema = {
  type: 'object',
  properties: {
    uid: { type: 'string', format: 'uuid' },
    language: { type: 'string' },
    uncommitedCode: { type: 'string' },
    code: { type: 'string' },
    history: {
      type: 'array',
      items: { type: 'string' }
    },
    future: {
      type: 'array',
      items: { type: 'string' }
    }
  },
  required: ['uid', 'language', 'uncommitedCode', 'code', 'history', 'future']
}

const componentCodeChangeSchema: Schema = {
  type: 'object',
  properties: {
    uid: { type: 'string', format: 'uuid' },
    uncommitedCode: { type: 'string' }
  },
  required: ['uid', 'uncommitedCode']
}

const componentCommitOrderSchema: Schema = {
  type: 'object',
  properties: {
    componentId: { type: 'string', format: 'uuid' },
    message: { type: 'string' }
  },
  required: ['componentId', 'message']
}

const componentCommitSchema: Schema = {
  type: 'object',
  properties: {
    uid: { type: 'string', format: 'uuid' },
    timestamp: { type: 'number' },
    componentId: { type: 'string', format: 'uuid' },
    message: { type: 'string' },
    change: codeChangeSchema
  },
  required: ['uid', 'timestamp', 'componentId', 'message', 'change']
}

export {
  componentCreationSchema,
  componentDeletionSchema,
  componentSchema,
  componentDefinitionSchema,
  componentCodeChangeSchema,
  componentCommitOrderSchema,
  componentCommitSchema
}
