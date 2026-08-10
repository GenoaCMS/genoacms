import credentials from './serviceAccount.json' with { type: 'json' }
import authCredentials from './authCredentials.js'
import { collections } from '../collections.js'

const firestore = {
  name: 'firestore',
  adapterPath: '@genoacms/adapter-gcp/database',
  adapter: import('@genoacms/adapter-gcp/database'),
  region: 'eu-west3',
  databaseId: '(default)',
  projectId: 'genoacms',
  credentials
}
const cloudStorage = {
  name: 'FIM-gcs',
  adapterPath: '@genoacms/adapter-gcp/storage',
  adapter: import('@genoacms/adapter-gcp/storage'),
  projectId: 'genoacms',
  credentials
}

/**
 * @type {import('@genoacms/cloudabstraction').Config}
 */
const config = {
  authentication: {
    providers: [
      {
        adapterPath: '@genoacms/authentication-adapter-array',
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
        adapterPath: '@genoacms/adapter-gcp/authorization',
        adapter: import('@genoacms/adapter-gcp/authorization'),
        projectId: 'genoacms',
        credentials
      }
    ]
  },
  database: {
    defaultDatabase: 'firestore',
    databases: [
      {
        name: 'firestore',
        providerName: 'firestore',
        collections
      }
    ],
    providers: [
      firestore
    ]
  },
  deployment: {
    providers: [
      {
        name: 'local',
        adapter: import('@genoacms/adapter-node')
      },
      {
        name: 'gcp',
        adapter: import('@genoacms/adapter-gcp/deployment'),
        projectId: 'genoacms',
        region: 'europe-west3',
        credentials
      }
    ]
  },
  storage: {
    defaultBucket: 'genoacms',
    buckets: [
      {
        name: 'genoacms',
        providerName: 'FIM-gcs'
      },
      {
        name: 'genoacms-public',
        providerName: 'FIM-gcs'
      }
    ],
    providers: [
      cloudStorage
    ]
  }
}

export default config
