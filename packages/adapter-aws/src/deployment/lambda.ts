import {
  CreateFunctionCommand,
  GetFunctionCommand,
  UpdateFunctionCodeCommand,
  AddPermissionCommand,
  GetFunctionUrlConfigCommand,
  type LambdaClient
} from '@aws-sdk/client-lambda'
import type { createApiGatewayOperations } from './apiGateway.js'

interface Dependencies {
  lambdaClient: LambdaClient
  apiGateway: ReturnType<typeof createApiGatewayOperations>
  options: { role: string, region: string, accountId: string, artifactBucket: string }
}

function createLambdaOperations ({ lambdaClient, apiGateway, options }: Dependencies): { createOrUpdateLambda: (functionName: string, sourcePath: string) => Promise<void> } {
  const { createApiGateway, getApiGatewayRootResourceId, createApiGatewayResource, createApiGatewayMethod, setLambdaIntegration, deployApi } = apiGateway
  const { role, region, accountId } = options

  async function isLambdaExisting (functionName: string): Promise<boolean> {
    try {
      await lambdaClient.send(new GetFunctionCommand({ FunctionName: functionName }))
      return true
    } catch {
      return false
    }
  }

  async function getLambdaUri (functionName: string): Promise<string> {
    const response = await lambdaClient.send(new GetFunctionUrlConfigCommand({ FunctionName: functionName }))
    return response.FunctionArn as string
  }

  async function addLambdaInvokePermission (apiId: string, functionName: string): Promise<void> {
    await lambdaClient.send(new AddPermissionCommand({
      FunctionName: functionName,
      StatementId: 'apigateway-access',
      Action: 'lambda:InvokeFunction',
      Principal: 'apigateway.amazonaws.com',
      SourceArn: `arn:aws:execute-api:${region}:${accountId}:${apiId}/prod/*/GET/${functionName}`
    }))
  }

  async function createLambda (functionName: string, sourcePath: string): Promise<void> {
    console.info('Creating lambda')
    await lambdaClient.send(new CreateFunctionCommand({
      FunctionName: functionName,
      Handler: 'index.handler',
      Role: role,
      Runtime: 'nodejs20.x',
      Code: { S3Bucket: options.artifactBucket, S3Key: sourcePath }
    }))
    const lambdaArn = await getLambdaUri(functionName)
    console.info('Creating api gateway')
    const apiId = await createApiGateway(functionName)
    console.info('Getting api gateway root resource id')
    const rootResourceId = await getApiGatewayRootResourceId(apiId)
    console.info('Creating api gateway resource')
    const resourceId = await createApiGatewayResource(apiId, rootResourceId, functionName)
    console.info('Creating api gateway method')
    await createApiGatewayMethod(apiId, resourceId)
    console.info('Setting lambda integration')
    await setLambdaIntegration(apiId, resourceId, region, lambdaArn)
    console.info('Deploying api gateway')
    await deployApi(apiId)
    console.info('Adding lambda invoke permission')
    await addLambdaInvokePermission(apiId, functionName)
  }

  async function updateLambda (functionName: string, sourcePath: string): Promise<void> {
    await lambdaClient.send(new UpdateFunctionCodeCommand({ FunctionName: functionName, S3Bucket: options.artifactBucket, S3Key: sourcePath }))
  }

  async function createOrUpdateLambda (functionName: string, sourcePath: string): Promise<void> {
    if (await isLambdaExisting(functionName)) await updateLambda(functionName, sourcePath)
    else await createLambda(functionName, sourcePath)
  }

  return { createOrUpdateLambda }
}

export { createLambdaOperations }
