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
    cookieName: '__session'
  },
  secrets: {
    // Development default. For a real GCP deployment replace this with Secret Manager:
    //
    //   {
    //     name: 'secret-manager',
    //     adapterPath: '@genoacms/adapter-gcp/secrets',
    //     adapter: import('@genoacms/adapter-gcp/secrets'),
    //     projectId: 'genoacms',
    //     credentials
    //   }
    //
    // Only one provider may be configured, so this is a replacement rather than an addition.
    providers: [
      {
        name: 'local',
        adapterPath: '@genoacms/adapter-secrets-env',
        adapter: import('@genoacms/adapter-secrets-env')
      }
    ]
  },
  languages: {
    // What components may be authored in. Each adapter parses, analyzes and compiles one language;
    // a component records which one it uses, so an instance can hold several at once.
    providers: [
      {
        adapterPath: '@genoacms/language-adapter-ts',
        adapter: import('@genoacms/language-adapter-ts'),
        // What compiled components are lowered to. Defaults to es2020, which every browser with ES
        // module support understands. Raise it for smaller, more modern output at the cost of the
        // browsers below it. Applies to revisions compiled from here on; published ones are never
        // rebuilt, so they keep verifying against the target they were compiled for.
        target: 'es2020'
      }
    ]
  },
  authorization: {
    // Authority: immutable at runtime, merged when authorization is read rather than written into
    // the manifests, and deleting one revokes what it granted.
    roles: {
      Administrator: [{ permission: '*', resource: '*' }]
    },
    assignments: {
      'e0d5a1c4-5a0f-4a4e-9b3a-6d1c8f2b7a01': ['Administrator']
    }
  },
  security: {
    // Seeds the signed security policy document at first start; the live value lives there.
    subordinateKeyRotationDays: 90
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
