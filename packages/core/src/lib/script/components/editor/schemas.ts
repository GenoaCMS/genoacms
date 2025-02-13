import type { JSONSchemaType } from 'ajv'
import type { CodeChange, Component, ComponentCodeChange, ComponentCommit, ComponentCommitOrder, ComponentCreation, ComponentDefinition, ComponentDeletion } from './types'

const componentCreationSchema: JSONSchemaType<ComponentCreation> = {
  type: 'object',
  properties: {
    name: { type: 'string' }
  },
  required: ['name']
}

const componentDeletionSchema: JSONSchemaType<ComponentDeletion> = {
  type: 'object',
  properties: {
    uid: { type: 'string', format: 'uuid' },
    name: { type: 'string' }
  },
  required: ['uid', 'name']
}

const componentSchema: JSONSchemaType<Component> = {
  type: 'object',
  properties: {
    uid: { type: 'string', format: 'uuid' },
    name: { type: 'string' }
  },
  required: ['uid', 'name']
}

const codeChangeSchema: JSONSchemaType<CodeChange> = {}

const componentDefinitionSchema: JSONSchemaType<ComponentDefinition> = {
  type: 'object',
  properties: {
    uid: { type: 'string', format: 'uuid' },
    language: { const: 'javascript' },
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

const componentCodeChangeSchema: JSONSchemaType<ComponentCodeChange> = {
  type: 'object',
  properties: {
    uid: { type: 'string', format: 'uuid' },
    uncommitedCode: { type: 'string' }
  },
  required: ['uid', 'uncommitedCode']
}

const componentCommitOrderSchema: JSONSchemaType<ComponentCommitOrder> = {
  type: 'object',
  properties: {
    componentId: { type: 'string', format: 'uuid' },
    message: { type: 'string' }
  },
  required: ['componentId', 'message']
}

const componentCommitSchema: JSONSchemaType<ComponentCommit> = {
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
