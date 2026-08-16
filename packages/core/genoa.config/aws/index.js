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
    // Resolved from the secrets service at startup. Never a literal: genoa.config is
    // committed, and this key signs every session token.
    JWTSecret: { secret: 'GENOACMS_JWT_SECRET' }
  },
  secrets: {
    providers: [
      {
        name: 'local',
        adapterPath: '@genoacms/adapter-secrets-env',
        adapter: import('@genoacms/adapter-secrets-env')
      }
    ]
  },
  security: {
    adminSubject: 'e0d5a1c4-5a0f-4a4e-9b3a-6d1c8f2b7a01',
    manifestTrust: 'accept-unsigned' // TODO: require-signature once manifest signing exists
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
