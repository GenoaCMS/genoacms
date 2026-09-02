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
    cookieName: '__session'
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
    // Roles and assignments declared here are authoritative: immutable at runtime, and merged when
    // authorization is read rather than written into the manifests. Deleting one revokes it.
    roles: {
      Administrator: [{ permission: '*', resource: '*' }]
    },
    assignments: {
      'e0d5a1c4-5a0f-4a4e-9b3a-6d1c8f2b7a01': ['Administrator']
    },
    // Seeds the signed security policy document at first start; the live value lives there.
    subordinateKeyRotationDays: 90,
    // Runtime guard ceilings for dynamic components. Sized so that no reasonable presentational
    // component reaches one: a guard firing on correct code teaches operators to raise it.
    maxFuel: 1_000_000,
    maxDepth: 100,
    maxAllocation: 10_000_000
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
