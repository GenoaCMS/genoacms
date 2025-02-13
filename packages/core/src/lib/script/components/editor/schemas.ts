import type { JSONSchemaType } from 'ajv'
import type { CodeChange, Component, ComponentCodeChange, ComponentCreation, ComponentDefinition, ComponentDeletion } from './types'

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
      items: codeChangeSchema
    },
    future: {
      type: 'array',
      items: codeChangeSchema
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

export {
  componentCreationSchema,
  componentDeletionSchema,
  componentSchema,
  componentDefinitionSchema,
  componentCodeChangeSchema
}
