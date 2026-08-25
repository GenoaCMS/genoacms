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

/**
 * What the browser sends to commit.
 *
 * Deliberately without `authorId`. The author is established from the session on the server; a
 * client permitted to name it could attribute its commit to another principal, and the signed
 * executable would carry that claim.
 */
const componentCommitOrderSchema: Schema = {
  type: 'object',
  properties: {
    componentId: { type: 'string', format: 'uuid' },
    message: { type: 'string' }
  },
  required: ['componentId', 'message']
}

/**
 * A stored commit.
 *
 * `authorId` is required, so a commit written before commits recorded one fails to validate rather
 * than being read with the field absent. That refusal is the intended behavior: the author cannot be
 * recovered afterwards, and a placeholder would be a signed claim of attribution that is not true.
 */
const componentCommitSchema: Schema = {
  type: 'object',
  properties: {
    uid: { type: 'string', format: 'uuid' },
    timestamp: { type: 'number' },
    componentId: { type: 'string', format: 'uuid' },
    message: { type: 'string' },
    authorId: { type: 'string', minLength: 1 },
    change: codeChangeSchema
  },
  required: ['uid', 'timestamp', 'componentId', 'message', 'authorId', 'change']
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
