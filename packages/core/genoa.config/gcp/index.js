import credentials from './serviceAccount.json' assert { type: 'json' }
import authCredentials from './authCredentials.js'
import { collections } from '../collections.js'

const firestore = {
  name: 'firestore',
  adapter: import('@genoacms/adapter-gcp/database'),
  region: 'eu-west3',
  databaseId: '(default)',
  projectId: 'genoacms',
  credentials
}
const cloudStorage = {
  name: 'gcs',
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
        name: 'gcp',
        adapter: import('@genoacms/adapter-gcp/authorization'),
        projectId: 'genoacms',
        credentials
      }
    ]
  },
  database: {
    databases: [
      {
        providerName: 'firestore',
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
        providerName: 'gcs'
      },
      {
        name: 'genoacms-public',
        providerName: 'gcs'
      }
    ],
    providers: [
      cloudStorage
    ]
  }
}

export default config
