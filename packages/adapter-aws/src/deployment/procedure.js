import { join } from 'node:path'
import { S3Client } from '@aws-sdk/client-s3'
import { LambdaClient } from '@aws-sdk/client-lambda'
import { APIGatewayClient } from '@aws-sdk/client-api-gateway'
import { defineDeployProcedure } from '@genoacms/contracts'
import { clientConfig } from '../shared.js'
import { stageLambdaApp, zipDirectory, installProductionDependencies } from './stage.js'
import { uploadArchive } from './upload.js'
import { createApiGatewayOperations } from './apiGateway.js'
import { createLambdaOperations } from './lambda.js'

const DEFAULT_FUNCTION_NAME = 'genoacms'

/** @param {import('./descriptor.js').AwsDeploymentOptions & { credentials?: import('../shared.js').AwsCredentials }} options */
function createClients (options) {
  const config = clientConfig(options.region, options.credentials)
  return { s3: new S3Client(config), lambda: new LambdaClient(config), apiGateway: new APIGatewayClient(config) }
}

/** Stages, installs, zips and uploads the artifact, then creates or updates Lambda and API Gateway. */
export default defineDeployProcedure(async (options, ctx) => {
  const app = await stageLambdaApp(ctx.buildDir, join(ctx.workDir, 'app'), installProductionDependencies)
  const archive = await zipDirectory(app, join(ctx.workDir, 'build.zip'))
  const clients = createClients(options)
  const key = await uploadArchive(clients.s3, options.artifactBucket, archive)
  const apiGateway = createApiGatewayOperations(clients.apiGateway)
  const { createOrUpdateLambda } = createLambdaOperations({ lambdaClient: clients.lambda, apiGateway, options })
  await createOrUpdateLambda(options.functionName ?? DEFAULT_FUNCTION_NAME, key)
})
