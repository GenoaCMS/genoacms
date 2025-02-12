import type { JSONSchemaType } from 'ajv'
import type { Component, ComponentCreation } from './types'

const componentCreationSchema: JSONSchemaType<ComponentCreation> = {
  type: 'object',
  properties: {
    name: { type: 'string' }
  },
  required: ['name']
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

export {
  componentCreationSchema,
  componentSchema
}
