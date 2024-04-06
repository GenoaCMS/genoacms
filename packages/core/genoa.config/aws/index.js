import authCredentials from './authCredentials.js'
import 'dotenv/config'
import { collections } from '../collections.js'

const credentials = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
}

/**
 * @type {import('@genoacms/cloudabstraction').genoaConfig}
 */
const config = {
  authentication: {
    adapter: import('@genoacms/authentication-adapter-array'),
    credentials: authCredentials,
    cookieName: '__session',
    JWTSecret: 'genoacms123' // In real world deployment, pass from environment variable
  },
  authorization: {
    adapter: import('@genoacms/adapter-aws/authorization'),
    region: 'eu-west-2',
    credentials
  },
  database: {
    adapter: import('@genoacms/adapter-aws/database'),
    region: 'eu-west-2',
    credentials,
    collections
  },
  deployment: {
    adapter: import('@genoacms/adapter-aws/deployment'),
    region: 'eu-west-2',
    credentials
  },
  storage: {
    adapter: import('@genoacms/adapter-aws/storage'),
    region: 'eu-central-1',
    defaultBucket: 'genoacms.test',
    buckets: [
      'genoacms.test'
    ],
    credentials
  }
}

export default config
