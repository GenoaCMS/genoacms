import type { JSONSchemaType } from 'ajv'
import type { CodeChange, Component, ComponentCreation, ComponentDefinition, ComponentDeletion } from './types'

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
    entryId: { type: 'string', format: 'uuid' },
    name: { type: 'string' }
  },
  required: ['entryId', 'name']
}

const componentSchema: JSONSchemaType<Component> = {
  type: 'object',
  properties: {
    entryId: { type: 'string', format: 'uuid' },
    definitionId: { type: 'string', format: 'uuid' },
    name: { type: 'string' }
  },
  required: ['entryId', 'definitionId', 'name']
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

export {
  componentCreationSchema,
  componentDeletionSchema,
  componentSchema,
  componentDefinitionSchema
}
