import {
  defineConfig, storageProvider, databaseProvider, authenticationProvider,
  secretsProvider, deploymentTarget, inline
} from '@genoacms/config'
import type {} from '@genoacms/adapter-gcp/storage'
import type {} from '@genoacms/adapter-gcp/database'
import type {} from '@genoacms/adapter-secrets-env'
import type {} from '@genoacms/authentication-adapter-array'
import type {} from '@genoacms/adapter-node'
// Gitignored and kept where they have always been, so this file needs them to load.
import serviceAccount from './genoa.config/gcp/serviceAccount.json' with { type: 'json' }
import authCredentials from './genoa.config/gcp/authCredentials.js'
import { collections } from './genoa/collections.js'
import { authorization } from './genoa/authorization.js'
import { security } from './genoa/security.js'
import { languages } from './genoa/languages.js'

/** Development: the local secret store, today's GCP project and credentials, a local Node target. */
export default defineConfig({
  authentication: {
    cookieName: '__session',
    providers: {
      array: authenticationProvider('@genoacms/authentication-adapter-array', { credentials: inline(authCredentials) })
    }
  },
  secrets: {
    // Development only: a production build refuses it. genoa.config.production.ts uses Secret Manager.
    // Only one provider may be configured, so that is a replacement rather than an addition.
    providers: { local: secretsProvider('@genoacms/adapter-secrets-env', {}) }
  },
  storage: {
    providers: {
      'FIM-gcs': storageProvider('@genoacms/adapter-gcp/storage', { projectId: 'genoacms', credentials: inline(serviceAccount) })
    },
    buckets: { genoacms: { provider: 'FIM-gcs' }, 'genoacms-public': { provider: 'FIM-gcs' } },
    defaultBucket: 'genoacms'
  },
  database: {
    providers: {
      firestore: databaseProvider('@genoacms/adapter-gcp/database', { projectId: 'genoacms', databaseId: '(default)', credentials: inline(serviceAccount) })
    },
    databases: { firestore: { provider: 'firestore', collections } }
  },
  languages,
  deployment: { targets: { local: deploymentTarget('@genoacms/adapter-node', {}) } },
  authorization,
  security
})
