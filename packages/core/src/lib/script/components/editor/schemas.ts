import type { Schema } from '@exodus/schemasafe'

/**
 * Creating a component.
 *
 * The name is **not** constrained to an identifier. It used to be, because it was the function the
 * component's source had to declare, so a name a source file could not name was a component nobody
 * could ever publish. The CMS emits that function under a fixed name of its own now, and a
 * component's name is a label a person reads.
 */
const componentCreationSchema: Schema = {
  type: 'object',
  properties: {
    name: { type: 'string', minLength: 1 }
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

const componentDefinitionSchema: Schema = {
  type: 'object',
  properties: {
    uid: { type: 'string', format: 'uuid' },
    language: { type: 'string' },
    body: { type: 'string' },
    publishedBody: { type: 'string' },
    publishedSignature: { type: 'string' },
    // Absent until the component has been published, which is how a page build tells that it has
    // nothing to serve yet.
    lastPublicationId: { type: 'string', format: 'uuid' }
  },
  required: ['uid', 'language', 'body', 'publishedBody', 'publishedSignature']
}

const componentCodeChangeSchema: Schema = {
  type: 'object',
  properties: {
    uid: { type: 'string', format: 'uuid' },
    body: { type: 'string' }
  },
  required: ['uid', 'body']
}

export {
  componentCreationSchema,
  componentDeletionSchema,
  componentSchema,
  componentDefinitionSchema,
  componentCodeChangeSchema
}
