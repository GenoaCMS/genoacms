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
import { security } from './security.js'
import { languages } from './languages.js'

/** End-to-end tests (`e2e/`): the test project's bucket through ADC, users from the environment of each server run. */
const projectId = process.env.GENOACMS_TEST_GCP_PROJECT ?? 'genoacms'
const bucket = process.env.GENOACMS_TEST_GCP_BUCKET ?? 'genoacms-tests'
const secretsPath = process.env.GENOACMS_E2E_SECRETS ?? '.genoacms/e2e-secrets.env'

export default defineConfig({
  authentication: {
    cookieName: '__session',
    providers: {
      primary: authenticationProvider('@genoacms/authentication-adapter-array', { credentials: env('GENOACMS_E2E_PRIMARY_USERS') }),
      secondary: authenticationProvider('@genoacms/authentication-adapter-array', { credentials: env('GENOACMS_E2E_SECONDARY_USERS') })
    }
  },
  secrets: {
    providers: { local: secretsProvider('@genoacms/adapter-secrets-env', { path: secretsPath }) }
  },
  storage: {
    providers: { gcs: storageProvider('@genoacms/adapter-gcp/storage', { projectId }) },
    buckets: { [bucket]: { provider: 'gcs' } },
    defaultBucket: bucket
  },
  database: {
    providers: { firestore: databaseProvider('@genoacms/adapter-gcp/database', { projectId, databaseId: '(default)' }) },
    databases: { firestore: { provider: 'firestore', collections } }
  },
  languages,
  deployment: { targets: { local: deploymentTarget('@genoacms/adapter-node', {}) } },
  authorization: {
    roles: { Administrator: [{ permission: '*', resource: '*' }] },
    assignments: { 'e2e-ada': ['Administrator'], 'e2e-bob': ['Administrator'] }
  },
  security
})
