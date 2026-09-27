import {
  defineConfig, storageProvider, databaseProvider, authenticationProvider,
  secretsProvider, deploymentTarget, secret
} from '@genoacms/config'
import type {} from '%storage%'
import type {} from '%database%'
import type {} from '%authentication%'
import type {} from '@genoacms/adapter-secrets-env'
import type {} from '@genoacms/adapter-node'
import { collections } from './collections.js'
import { authorization } from './authorization.js'
import { security } from './security.js'
import { languages } from './languages.js'

/**
 * Development. Found by `genoa dev` without `--config`.
 *
 * GENOACMS_ADMIN_CREDENTIALS is read from the development secrets store,
 * .genoacms/secrets.env, as one line of JSON:
 *
 *   GENOACMS_ADMIN_CREDENTIALS=[{"email":"admin@example.com","password":"...","subject":"admin"}]
 */
export default defineConfig({
  authentication: {
    cookieName: '__session',
    providers: {
      admins: authenticationProvider('%authentication%', { credentials: secret('GENOACMS_ADMIN_CREDENTIALS') })
    }
  },
  secrets: {
    // Development only: a production build refuses it. production.ts uses a real secret manager.
    // Only one provider may be configured, so that is a replacement rather than an addition.
    providers: { local: secretsProvider('@genoacms/adapter-secrets-env', {}) }
  },
  storage: {
    providers: {
      // TODO: options, see the adapter's README
      storage: storageProvider('%storage%', {})
    },
    // TODO: the name of a bucket your project already uses
    buckets: { 'your-bucket': { provider: 'storage' } },
    defaultBucket: 'your-bucket'
  },
  database: {
    providers: {
      // TODO: options, see the adapter's README
      database: databaseProvider('%database%', {})
    },
    databases: { database: { provider: 'database', collections } }
  },
  deployment: { targets: { local: deploymentTarget('@genoacms/adapter-node', {}) } },
  languages,
  authorization,
  security
})
