const testCollection = {
  name: 'test',
  primaryKey: 'id',
  schema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        format: 'uuid'
      },
      name: {
        type: 'string'
      },
      isA: {
        type: 'boolean'
      },
      markdown: {
        type: 'string',
        format: 'markdown'
      }
    }
  }
}

export const collections = [testCollection]
