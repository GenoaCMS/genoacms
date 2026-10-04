import {
  defineConfig, storageProvider, databaseProvider, authenticationProvider,
  secretsProvider, deploymentTarget
} from '@genoacms/config'
import type {} from '@genoacms/adapter-gcp/authentication/identity-platform'
import type {} from '@genoacms/adapter-gcp/storage'
import type {} from '@genoacms/adapter-gcp/database'
import type {} from '@genoacms/adapter-gcp/secrets'
import type {} from '@genoacms/adapter-gcp/deployment'
import { collections } from './collections.js'
import { authorization } from './authorization.js'
import { security } from './security.js'
import { languages } from './languages.js'

/**
 * Example: production on Google Cloud. Users sign in through Firebase Authentication, and every
 * provider authenticates as the function's service account, so no credential is written here.
 *
 *   genoa deploy gcp --config genoa.config/gcp.ts
 */
export default defineConfig({
  authentication: {
    cookieName: '__session',
    providers: {
      firebase: authenticationProvider('@genoacms/adapter-gcp/authentication/identity-platform', { projectId: 'my-project' })
    }
  },
  secrets: {
    providers: { 'secret-manager': secretsProvider('@genoacms/adapter-gcp/secrets', { projectId: 'my-project' }) }
  },
  storage: {
    providers: {
      gcs: storageProvider('@genoacms/adapter-gcp/storage', { projectId: 'my-project' })
    },
    buckets: { 'my-project-cms': { provider: 'gcs' }, 'my-project-public': { provider: 'gcs' } },
    defaultBucket: 'my-project-cms'
  },
  database: {
    providers: {
      firestore: databaseProvider('@genoacms/adapter-gcp/database', { projectId: 'my-project', databaseId: '(default)' })
    },
    databases: { content: { provider: 'firestore', collections } }
  },
  languages,
  deployment: {
    targets: {
      gcp: deploymentTarget('@genoacms/adapter-gcp/deployment', {
        projectId: 'my-project',
        region: 'europe-west3',
        memory: '1Gi',
        serviceAccount: 'genoacms@my-project.iam.gserviceaccount.com'
      })
    }
  },
  authorization,
  security
})
