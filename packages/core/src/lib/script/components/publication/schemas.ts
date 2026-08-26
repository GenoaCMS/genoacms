import type { Schema } from '@exodus/schemasafe'

/**
 * What the browser sends to publish.
 *
 * Without a publisher, for the reason given on `ComponentPublicationOrder`: the server establishes
 * who is publishing, and a client that could name it could attribute its release to someone else.
 */
const componentPublicationOrderSchema: Schema = {
  type: 'object',
  properties: {
    componentId: { type: 'string', format: 'uuid' },
    note: { type: 'string' }
  },
  required: ['componentId', 'note']
}

/**
 * The stored pointer to a component's latest publication.
 *
 * Every member is required. A record read with `publisherId` or `headerDigest` absent would be worse
 * than no record: the first reads as attribution while carrying none, and the second would make the
 * next publication's `no change` comparison run against nothing and silently pass.
 */
const publishedComponentSchema: Schema = {
  type: 'object',
  properties: {
    uid: { type: 'string', format: 'uuid' },
    publicationId: { type: 'string', format: 'uuid' },
    publisherId: { type: 'string', minLength: 1 },
    publishedAt: { type: 'number' },
    note: { type: 'string' },
    headerDigest: { type: 'string', minLength: 1 }
  },
  required: ['uid', 'publicationId', 'publisherId', 'publishedAt', 'note', 'headerDigest']
}

export { componentPublicationOrderSchema, publishedComponentSchema }
