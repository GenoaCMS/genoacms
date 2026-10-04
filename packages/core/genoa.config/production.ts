import {
  defineConfig, storageProvider, databaseProvider, authenticationProvider,
  secretsProvider, deploymentTarget, inline
} from '@genoacms/config'
import type {} from '@genoacms/adapter-gcp/storage'
import type {} from '@genoacms/adapter-gcp/database'
import type {} from '@genoacms/adapter-gcp/secrets'
import type {} from '@genoacms/adapter-gcp/deployment'
import type {} from '@genoacms/adapter-gcp/authentication/identity-platform'
// Gitignored. Used only by the gcp target, on the operator's machine: deployment options never
// enter the build.
import serviceAccount from './gcp/serviceAccount.json' with { type: 'json' }
import { collections } from './collections.js'
import { authorization } from './authorization.js'
import { security } from './security.js'
import { languages } from './languages.js'

/**
 * Production on GCP. Storage, Firestore, Secret Manager and Identity Platform authenticate as the
 * function's own service account (Application Default Credentials), so no credential ships with the
 * build; users are managed in Identity Platform.
 */
export default defineConfig({
  authentication: {
    cookieName: '__session',
    providers: {
      'identity-platform': authenticationProvider('@genoacms/adapter-gcp/authentication/identity-platform', { projectId: 'genoacms' })
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
