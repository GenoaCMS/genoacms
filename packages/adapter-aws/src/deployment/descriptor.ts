import { defineDeploymentTarget, type Secret } from '@genoacms/contracts'
import { unknownOptions, requireString, type AwsCredentials } from '../shared.js'

const ALLOWED = ['region', 'role', 'accountId', 'artifactBucket', 'functionName', 'credentials']

export interface AwsDeploymentOptions {
  region: string
  /** IAM role ARN the Lambda function runs as. */
  role: string
  /** Account id, used in the API Gateway invoke permission. */
  accountId: string
  /** S3 bucket the deployment archive is uploaded to. */
  artifactBucket: string
  /** Default 'genoacms'. */
  functionName?: string
  /** Used by `genoa deploy` on the operator's machine only. Omitted: the SDK's default chain. */
  credentials?: Secret<AwsCredentials>
}

declare module '@genoacms/contracts' {
  interface DeploymentTargets { '@genoacms/adapter-aws/deployment': AwsDeploymentOptions }
}

export default defineDeploymentTarget<AwsDeploymentOptions>({
  svelteKitAdapter: async () => await import('@sveltejs/adapter-node'),
  svelteKitOptions: (_options, { outDir }) => ({ out: outDir }),
  procedure: async () => await import('./procedure.js'),
  secretOptions: { credentials: 'json' },
  validate: options => [
    ...unknownOptions(options, ALLOWED),
    ...['region', 'role', 'accountId', 'artifactBucket'].flatMap(key => requireString(options, key))
  ]
})
