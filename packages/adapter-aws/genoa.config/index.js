import 'dotenv/config'

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
const credentials = {
  accessKeyId: globalThis.process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: globalThis.process.env.AWS_SECRET_ACCESS_KEY
}
/**
 * @type {import('./src/genoa.config.d.ts').default}
 */
const config = {
  authentication: {
    adapter: import('../src/services/authentication/index.js'),
    region: 'eu-west-2',
    credentials
  },
  database: {
    adapter: import('../src/services/database/index.js'),
    region: 'eu-west-2',
    credentials
  },
  storage: {
    adapter: import('../src/services/storage/index.js'),
    region: 'eu-central-1',
    credentials,
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
