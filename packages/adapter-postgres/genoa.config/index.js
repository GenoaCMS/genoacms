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
}

export default config
