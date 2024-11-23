import credentials from './serviceAccount.json' assert { type: 'json' }
import authCredentials from './authCredentials.js'
import { collections } from '../collections.js'

const firestore = {
  name: '@genoacms/adapter-gcp/database',
  adapter: import('@genoacms/adapter-gcp/database'),
  region: 'eu-west3',
  databaseId: '(default)',
  projectId: 'genoacms',
  credentials
}
const cloudStorage = {
  name: '@genoacms/adapter-gcp/storage',
  adapter: import('@genoacms/adapter-gcp/storage'),
  projectId: 'genoacms',
  credentials
}

/**
 * @type {import('@genoacms/cloudabstraction').genoaConfig}
 */
const config = {
  authentication: {
    providers: [
      {
        name: '@genoacms/authentication-adapter-array',
        adapter: import('@genoacms/authentication-adapter-array'),
        credentials: authCredentials
      }
    ],
    cookieName: '__session',
    JWTSecret: 'genoacms123' // In real world deployment, pass from environment variable
  },
  authorization: {
    providers: [
      {
        name: '@genoacms/adapter-gcp/authorization',
        adapter: import('@genoacms/adapter-gcp/authorization'),
        projectId: 'genoacms',
        credentials
      }
    ]
  },
  database: {
    databases: [
      {
        providerName: '@genoacms/adapter-gcp/database',
        collections
      }
    ],
    providers: [
      firestore
    ]
  },
  deployment: {
    adapter: import('@genoacms/adapter-gcp/deployment'),
    projectId: 'genoacms',
    region: 'europe-west3',
    credentials
  },
  storage: {
    defaultBucket: 'genoacms',
    buckets: [
      {
        name: 'genoacms',
        providerName: '@genoacms/adapter-gcp/storage'
      },
      {
        name: 'genoacms-public',
        providerName: '@genoacms/adapter-gcp/storage'
      }
    ],
    providers: [
      cloudStorage
    ]
  }
}

export default config
