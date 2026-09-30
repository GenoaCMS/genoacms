import { join } from 'node:path'
import { S3Client } from '@aws-sdk/client-s3'
import { LambdaClient } from '@aws-sdk/client-lambda'
import { APIGatewayClient } from '@aws-sdk/client-api-gateway'
import { defineDeployProcedure } from '@genoacms/contracts'
import { clientConfig, type AwsCredentials } from '../shared.js'
import type { AwsDeploymentOptions } from './descriptor.js'
import { stageLambdaApp, zipDirectory, installProductionDependencies } from './stage.js'
import { uploadArchive } from './upload.js'
import { createApiGatewayOperations } from './apiGateway.js'
import { createLambdaOperations } from './lambda.js'

const DEFAULT_FUNCTION_NAME = 'genoacms'

type ResolvedOptions = Omit<AwsDeploymentOptions, 'credentials'> & { credentials?: AwsCredentials }

function createClients (options: ResolvedOptions): { s3: S3Client, lambda: LambdaClient, apiGateway: APIGatewayClient } {
  const config = clientConfig(options.region, options.credentials)
  return { s3: new S3Client(config), lambda: new LambdaClient(config), apiGateway: new APIGatewayClient(config) }
}

export default defineDeployProcedure<AwsDeploymentOptions>(async (options, ctx) => {
  const resolved = options as unknown as ResolvedOptions
  const app = await stageLambdaApp(ctx.buildDir, join(ctx.workDir, 'app'), installProductionDependencies)
  const archive = await zipDirectory(app, join(ctx.workDir, 'build.zip'))
  const clients = createClients(resolved)
  const key = await uploadArchive(clients.s3, resolved.artifactBucket, archive)
  const apiGateway = createApiGatewayOperations(clients.apiGateway)
  const { createOrUpdateLambda } = createLambdaOperations({ lambdaClient: clients.lambda, apiGateway, options: resolved })
  await createOrUpdateLambda(resolved.functionName ?? DEFAULT_FUNCTION_NAME, key)
})
