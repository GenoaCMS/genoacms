const testCollection = {
  name: 'test',
  primaryKey: 'id',
  schema: {
    type: 'object',
    properties: {
      name: {
        type: 'string'
      },
      isA: {
        type: 'boolean'
      }
    }
  }
}

/**
 * @type {import('./src/genoa.config.d.ts').default}
 */
const config = {
  database: {
    adapter: import('./src/services/database/index.js'),
    region: 'eu-west-2'
  },
  storage: {
    adapter: import('./src/services/storage/index.js'),
    region: 'eu-central-1',
    buckets: [
      'genoacms.test'
    ],
    testingBucket: 'genoacms.test'
  },
  collections: [
    testCollection
  ],
  testDocuments: [
    { name: 'createDocument', isA: true },
    { name: 'updateDocument', isA: false }
  ]
}

export default config
