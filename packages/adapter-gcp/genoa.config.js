import credentials from './serviceAccount.json' assert { type: 'json' }

const testCollection = {
  name: 'test',
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
  authorization: {
    adapter: import('./dist/services/authorization/index.js'),
    projectId: 'genoacms',
    credentials
  },
  database: {
    adapter: import('./dist/services/database/index.js'),
    region: 'eu-west3',
    databaseId: '(default)',
    projectId: 'genoacms',
    credentials
  },
  storage: {
    adapter: import('./dist/services/storage/index.js'),
    projectId: 'genoacms',
    buckets: [
      'genoacms'
    ],
    defaultBucket: 'genoacms',
    credentials
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
