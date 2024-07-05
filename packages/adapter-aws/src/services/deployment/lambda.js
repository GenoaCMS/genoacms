import {
  LambdaClient,
  CreateFunctionCommand,
  GetFunctionCommand,
  UpdateFunctionCodeCommand,
  AddPermissionCommand,
  GetFunctionUrlConfigCommand
} from '@aws-sdk/client-lambda'
import { config } from '@genoacms/cloudabstraction'
import {
  createApiGateway,
  getApiGatewayRootResourceId,
  createApiGatewayResource,
  createApiGatewayMethod,
  setLambdaIntegration,
  deployApi
} from './apiGateway.js'

const lambdaClient = new LambdaClient({
  region: config.deployment.region,
  credentials: config.deployment.credentials
})
const deploymentRole = config.deployment.role
const accessKeyId = config.deployment.credentials.accessKeyId
const region = config.deployment.region

/**
 * @param {string} functionName
 * @returns {Promise<boolean>}
 */
async function isLambdaExisting (functionName) {
  try {
    await lambdaClient.send(new GetFunctionCommand({
      FunctionName: functionName
    }))
    return true
  } catch (error) {
    return false
  }
}

async function createLambda (functionName, sourcePath) {
  const params = {
    FunctionName: functionName,
    Handler: 'build.handler.handler',
    Role: deploymentRole,
    Runtime: 'nodejs20.x',
    Code: {
      S3Bucket: config.storage.defaultBucket,
      S3Key: sourcePath
    }

  }
  const command = new CreateFunctionCommand(params)
  console.info('Creating lambda')
  await lambdaClient.send(command)
  const lambdaArn = await getLambdaUri(functionName)
  console.info('Creating api gateway')
  const apiId = await createApiGateway(functionName)
  console.info('Getting api gateway root resource id')
  const rootResourceId = await getApiGatewayRootResourceId(apiId)
  console.info('Creating api gateway resource')
  const resourceId = await createApiGatewayResource(apiId, rootResourceId, functionName)
  console.info('Creating api gateway method')
  await createApiGatewayMethod(apiId, resourceId, functionName)
  console.info('Setting lambda integration')
  await setLambdaIntegration(apiId, resourceId, region, accessKeyId, functionName, lambdaArn)
  console.info('Deploying api gateway')
  await deployApi(apiId)
  console.info('Adding lambda invoke permission')
  await addLambdaInvokePermission(apiId, functionName, accessKeyId, region)
}

async function updateLambda (functionName, sourcePath) {
  const params = {
    FunctionName: functionName,
    S3Bucket: config.storage.defaultBucket,
    S3Key: sourcePath
  }
  const command = new UpdateFunctionCodeCommand(params)
  await lambdaClient.send(command)
}

/**
  * @param {string} functionName
  * @param {string} sourcePath
  * @returns {Promise<void>}
  */
async function createOrUpdateLambda (functionName, sourcePath) {
  const isExisting = await isLambdaExisting(functionName)
  if (isExisting) {
    await updateLambda(functionName, sourcePath)
  } else {
    await createLambda(functionName, sourcePath)
  }
}

/**
 * @param {string} FunctionName
 * @returns {Promise<string>}
 */
async function getLambdaUri (functionName) {
  const command = new GetFunctionUrlConfigCommand({
    FunctionName: functionName
  })
  const response = await lambdaClient.send(command)
  console.log(response)
  return response.FunctionArn
}

/**
 * @param {string} apiId
 * @param {string} functionName
 * @param {string} accessKeyId
 * @param {string} region
 * @returns {Promise<void>}
 */
async function addLambdaInvokePermission (apiId, functionName, accessKeyId, region) {
  const addPermissionCommand = new AddPermissionCommand({
    FunctionName: functionName,
    StatementId: 'apigateway-access',
    Action: 'lambda:InvokeFunction',
    Principal: 'apigateway.amazonaws.com',
    SourceArn: `arn:aws:execute-api:${region}:${accessKeyId}:${apiId}/*/GET/${functionName}`
  })

  await lambdaClient.send(addPermissionCommand)
}

export { createOrUpdateLambda }
