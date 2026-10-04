import {
  defineConfig, storageProvider, databaseProvider, authenticationProvider,
  secretsProvider, deploymentTarget, secret
} from '@genoacms/config'
import type {} from '@genoacms/authentication-adapter-array'
import type {} from '@genoacms/adapter-aws/storage'
import type {} from '@genoacms/adapter-aws/database'
import type {} from '@genoacms/adapter-aws/secrets'
import type {} from '@genoacms/adapter-aws/deployment'
import { collections } from './collections.js'
import { authorization } from './authorization.js'
import { security } from './security.js'
import { languages } from './languages.js'

/**
 * Example: production on AWS. Every provider takes the SDK's default credentials, which are the
 * Lambda function's execution role once deployed; the administrators' credentials live in
 * Secrets Manager.
 *
 *   genoa deploy aws --config genoa.config/aws.ts
 */
export default defineConfig({
  authentication: {
    cookieName: '__session',
    providers: {
      admins: authenticationProvider('@genoacms/authentication-adapter-array', { credentials: secret('GENOACMS_ADMIN_CREDENTIALS') })
    }
  },
  secrets: {
    providers: { 'secrets-manager': secretsProvider('@genoacms/adapter-aws/secrets', { region: 'eu-central-1' }) }
  },
  storage: {
    providers: {
      s3: storageProvider('@genoacms/adapter-aws/storage', { region: 'eu-central-1' })
    },
    buckets: { 'my-company-cms': { provider: 's3' }, 'my-company-public': { provider: 's3' } },
    defaultBucket: 'my-company-cms'
  },
  database: {
    providers: {
      dynamodb: databaseProvider('@genoacms/adapter-aws/database', { region: 'eu-central-1' })
    },
    databases: { content: { provider: 'dynamodb', collections } }
  },
  languages,
  deployment: {
    targets: {
      aws: deploymentTarget('@genoacms/adapter-aws/deployment', {
        region: 'eu-central-1',
        role: 'arn:aws:iam::123456789012:role/genoacms',
        artifactBucket: 'my-company-deployments'
      })
    }
  },
  authorization,
  security
})
