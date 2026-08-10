import { collections } from './collections.js'

/**
 * @type {import('@genoacms/cloudabstraction').Config}
 */
const config = {
  database: {
    defaultDatabase: 'postgres',
    databases: [
      {
        name: 'postgres',
        providerName: 'postgres',
        collections
      }
    ],
    providers: [{
      name: 'postgres',
      adapter: import('../src/index.js'),
      adapterPath: '@genoacms/adapter-postgres',
      provider: 'postgres',
      config: {
        host: 'localhost',
        port: 5432,
        database: 'postgres',
        username: 'postgres',
        password: 'postgres'
      }
    }]
  },
  testDocuments: [{
    id: crypto.randomUUID(),
    name: 'Test documnet 1',
    description: 'desc but changed',
    sections: []
  }, {
    id: crypto.randomUUID(),
    name: 'Test documnet 2',
    description: 'Another description',
    sections: [{

    }]
  }]
}

export default config
