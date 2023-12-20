import credentials from './serviceAccount.json' assert { type: 'json' }

/**
 * @type {import('./src/genoa.config.d.ts').default}
 */
const config = {
  // auth: {
  //     adapter: authAdapter
  // }
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
    credentials
  }
}

export default config
