import {
  APIGatewayClient,
  GetRestApiCommand,
  CreateRestApiCommand,
  GetResourcesCommand,
  CreateResourceCommand,
  PutMethodCommand,
  PutIntegrationCommand,
  CreateDeploymentCommand
} from '@aws-sdk/client-api-gateway'
import { config } from '@genoacms/cloudabstraction'

const apiGatewayClient = new APIGatewayClient({
  region: config.deployment.region,
  credentials: config.deployment.credentials
})

/**
  * @param {string} name
  * @returns {Promise<string | null>}
  */
async function isApiGatewayExisting (name) {
  try {
    const response = await apiGatewayClient.send(new GetRestApiCommand({ restApiId: name }))
    return response.id
  } catch (error) {
    return null
  }
}

/**
 * @param {string} name
 * @returns {Promise<string>}
 */
async function createApiGateway (name) {
  const gatewayId = await isApiGatewayExisting(name)
  if (gatewayId) return gatewayId
  const createRestApiCommand = new CreateRestApiCommand({ name })
  const response = await apiGatewayClient.send(createRestApiCommand)
  return response.id
}

/**
 * @param {string} apiId
 * @returns {Promise<string>}
 */
async function getApiGatewayRootResourceId (apiId) {
  const getResourcesCommand = new GetResourcesCommand({ restApiId: apiId })
  const response = await apiGatewayClient.send(getResourcesCommand)
  return response.items[0].id
}

/**
 * @param {string} apiId
 * @param {string} parentId
 * @param {string} functionName
 * @returns {Promise<string>}
 */
async function createApiGatewayResource (apiId, parentId, functionName) {
  const createResourceCommand = new CreateResourceCommand({
    restApiId: apiId,
    parentId,
    pathPart: functionName
  })
  const response = await apiGatewayClient.send(createResourceCommand)
  return response.id
}

/**
 * @param {string} apiId
 * @param {string} resourceId
 */
async function createApiGatewayMethod (apiId, resourceId) {
  const putMethodCommand = new PutMethodCommand({
    restApiId: apiId,
    resourceId,
    httpMethod: 'GET',
    authorizationType: 'NONE'
  })
  await apiGatewayClient.send(putMethodCommand)
}

/**
 * @param {string} apiId
 * @param {string} resourceId
 * @param {string} region
 * @param {string} accessKeyId
 * @param {string} functionName
 */
async function setLambdaIntegration (apiId, resourceId, lambdaArn) {
  console.log('setLambdaIntegration', lambdaArn)
  const putIntegrationCommand = new PutIntegrationCommand({
    restApiId: apiId,
    resourceId,
    httpMethod: 'ANY',
    type: 'AWS_PROXY',
    integrationHttpMethod: 'POST',
    uri: lambdaArn
  })

  await apiGatewayClient.send(putIntegrationCommand)
}

/**
 * @param {string} apiId
 * @returns {Promise<void>}
 */
async function deployApi (apiId) {
  const createDeploymentCommand = new CreateDeploymentCommand({
    restApiId: apiId,
    stageName: 'prod'
  })

  await apiGatewayClient.send(createDeploymentCommand)
}

export {
  createApiGateway,
  getApiGatewayRootResourceId,
  createApiGatewayResource,
  createApiGatewayMethod,
  setLambdaIntegration,
  deployApi
}
