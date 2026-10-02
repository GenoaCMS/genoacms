import {
  defineConfig, storageProvider, databaseProvider, authenticationProvider,
  secretsProvider, deploymentTarget, env
} from '@genoacms/config'
import type {} from '@genoacms/adapter-gcp/storage'
import type {} from '@genoacms/adapter-gcp/database'
import type {} from '@genoacms/adapter-secrets-env'
import type {} from '@genoacms/authentication-adapter-array'
import type {} from '@genoacms/adapter-node'
import { collections } from './collections.js'
import { authorization } from './authorization.js'
import { security } from './security.js'
import { languages } from './languages.js'

/** Unit tests: development.ts's providers, with every credential an `env()` reference that no test resolves. */
export default defineConfig({
  authentication: {
    cookieName: '__session',
    providers: {
      array: authenticationProvider('@genoacms/authentication-adapter-array', { credentials: env('GENOACMS_TEST_CREDENTIALS') })
    }
  },
  secrets: {
    providers: { local: secretsProvider('@genoacms/adapter-secrets-env', {}) }
  },
  storage: {
    providers: {
      'FIM-gcs': storageProvider('@genoacms/adapter-gcp/storage', { projectId: 'genoacms', credentials: env('GENOACMS_TEST_SERVICE_ACCOUNT') })
    },
    buckets: { genoacms: { provider: 'FIM-gcs' }, 'genoacms-public': { provider: 'FIM-gcs' } },
    defaultBucket: 'genoacms'
  },
  database: {
    providers: {
      firestore: databaseProvider('@genoacms/adapter-gcp/database', { projectId: 'genoacms', databaseId: '(default)', credentials: env('GENOACMS_TEST_SERVICE_ACCOUNT') })
    },
    databases: { firestore: { provider: 'firestore', collections } }
  },
  languages,
  deployment: { targets: { local: deploymentTarget('@genoacms/adapter-node', {}) } },
  authorization,
  security
})
