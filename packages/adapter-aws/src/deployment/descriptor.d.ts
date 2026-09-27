import type { DeploymentDescriptor, Secret } from '@genoacms/contracts'
import type { AwsCredentials } from '../shared.js'

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

declare const descriptor: DeploymentDescriptor<AwsDeploymentOptions>
export default descriptor
