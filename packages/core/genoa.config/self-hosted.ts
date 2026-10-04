import {
  defineConfig, storageProvider, databaseProvider, authenticationProvider,
  secretsProvider, deploymentTarget, secret
} from '@genoacms/config'
import type {} from '@genoacms/authentication-adapter-array'
import type {} from '@genoacms/adapter-minio'
import type {} from '@genoacms/adapter-postgres'
import type {} from '@genoacms/adapter-secrets-env'
import type {} from '@genoacms/adapter-node'
import { collections } from './collections.js'
import { authorization } from './authorization.js'
import { security } from './security.js'
import { languages } from './languages.js'

/**
 * Example: MinIO and PostgreSQL on your own machines, served by Node. Every secret lives in
 * .genoacms/secrets.env. That store is for development only, so this config is a development one:
 *
 *   genoa dev --config genoa.config/self-hosted.ts
 */
export default defineConfig({
  authentication: {
    cookieName: '__session',
    providers: {
      admins: authenticationProvider('@genoacms/authentication-adapter-array', { credentials: secret('GENOACMS_ADMIN_CREDENTIALS') })
    }
  },
  secrets: {
    providers: { local: secretsProvider('@genoacms/adapter-secrets-env', {}) }
  },
  storage: {
    providers: {
      minio: storageProvider('@genoacms/adapter-minio', {
        endPoint: 'localhost',
        port: 9000,
        useSSL: false,
        accessKey: secret('MINIO_ACCESS_KEY'),
        secretKey: secret('MINIO_SECRET_KEY')
      })
    },
    buckets: { cms: { provider: 'minio' }, public: { provider: 'minio' } },
    defaultBucket: 'cms'
  },
  database: {
    providers: {
      postgres: databaseProvider('@genoacms/adapter-postgres', {
        host: 'localhost',
        database: 'genoacms',
        user: 'genoacms',
        password: secret('POSTGRES_PASSWORD')
      })
    },
    databases: { content: { provider: 'postgres', collections } }
  },
  languages,
  deployment: { targets: { node: deploymentTarget('@genoacms/adapter-node', { outDir: 'build' }) } },
  authorization,
  security
})
