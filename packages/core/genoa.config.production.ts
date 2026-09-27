import {
  defineConfig, storageProvider, databaseProvider, authenticationProvider,
  secretsProvider, deploymentTarget, secret, inline
} from '@genoacms/config'
import type {} from '@genoacms/adapter-gcp/storage'
import type {} from '@genoacms/adapter-gcp/database'
import type {} from '@genoacms/adapter-gcp/secrets'
import type {} from '@genoacms/adapter-gcp/deployment'
import type {} from '@genoacms/authentication-adapter-array'
// Gitignored. Used only by the gcp target, on the operator's machine: deployment options never
// enter the build.
import serviceAccount from './genoa.config/gcp/serviceAccount.json' with { type: 'json' }
import { collections } from './genoa/collections.js'
import { authorization } from './genoa/authorization.js'
import { security } from './genoa/security.js'
import { languages } from './genoa/languages.js'

/**
 * Production on GCP. Storage, Firestore and Secret Manager authenticate as the function's own
 * service account (Application Default Credentials), so no credential ships with the build; the
 * administrators' credentials live in Secret Manager.
 */
export default defineConfig({
  authentication: {
    cookieName: '__session',
    providers: {
      array: authenticationProvider('@genoacms/authentication-adapter-array', { credentials: secret('GENOACMS_ADMIN_CREDENTIALS') })
    }
  },
  secrets: {
    providers: { 'secret-manager': secretsProvider('@genoacms/adapter-gcp/secrets', { projectId: 'genoacms' }) }
  },
  storage: {
    providers: {
      'FIM-gcs': storageProvider('@genoacms/adapter-gcp/storage', { projectId: 'genoacms' })
    },
    buckets: { genoacms: { provider: 'FIM-gcs' }, 'genoacms-public': { provider: 'FIM-gcs' } },
    defaultBucket: 'genoacms'
  },
  database: {
    providers: {
      firestore: databaseProvider('@genoacms/adapter-gcp/database', { projectId: 'genoacms', databaseId: '(default)' })
    },
    databases: { firestore: { provider: 'firestore', collections } }
  },
  languages,
  deployment: {
    targets: {
      gcp: deploymentTarget('@genoacms/adapter-gcp/deployment', {
        projectId: 'genoacms',
        region: 'europe-west3',
        credentials: inline(serviceAccount)
      })
    }
  },
  authorization,
  security
})
