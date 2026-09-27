import {
  defineConfig, storageProvider, databaseProvider, authenticationProvider,
  secretsProvider, deploymentTarget, secret
} from '@genoacms/config'
import type {} from '%storage%'
import type {} from '%database%'
import type {} from '%authentication%'
import type {} from '%secrets%'
import type {} from '%deployment%'
import { collections } from './collections.js'
import { authorization } from './authorization.js'
import { security } from './security.js'
import { languages } from './languages.js'

/**
 * Production. Never found by default; build and deploy with:
 *
 *   genoa deploy --config genoa.config/production.ts
 */
export default defineConfig({
  authentication: {
    cookieName: '__session',
    providers: {
      admins: authenticationProvider('%authentication%', { credentials: secret('GENOACMS_ADMIN_CREDENTIALS') })
    }
  },
  secrets: {
    // The production store must hold GENOACMS_ADMIN_CREDENTIALS.
    providers: { secrets: secretsProvider('%secrets%', {}) }
  },
  storage: {
    providers: {
      // TODO: options; omit credentials to use the platform's default credentials
      storage: storageProvider('%storage%', {})
    },
    // TODO: the name of a bucket your project already uses
    buckets: { 'your-bucket': { provider: 'storage' } },
    defaultBucket: 'your-bucket'
  },
  database: {
    providers: {
      // TODO: options; omit credentials to use the platform's default credentials
      database: databaseProvider('%database%', {})
    },
    databases: { database: { provider: 'database', collections } }
  },
  deployment: {
    targets: {
      // TODO: options, see the adapter's README
      '%target%': deploymentTarget('%deployment%', {})
    }
  },
  languages,
  authorization,
  security
})
