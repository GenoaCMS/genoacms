import {
  GetRestApiCommand,
  CreateRestApiCommand,
  GetResourcesCommand,
  CreateResourceCommand,
  PutMethodCommand,
  PutIntegrationCommand,
  CreateDeploymentCommand,
  type APIGatewayClient
} from '@aws-sdk/client-api-gateway'

function createApiGatewayOperations (apiGatewayClient: APIGatewayClient) {
  async function isApiGatewayExisting (name: string): Promise<string | undefined> {
    try {
      const response = await apiGatewayClient.send(new GetRestApiCommand({ restApiId: name }))
      return response.id
    } catch {
      return undefined
    }
  }

  async function createApiGateway (name: string): Promise<string> {
    const gatewayId = await isApiGatewayExisting(name)
    if (gatewayId !== undefined) return gatewayId
    const response = await apiGatewayClient.send(new CreateRestApiCommand({ name }))
    return response.id as string
  }

  async function getApiGatewayRootResourceId (apiId: string): Promise<string> {
    const response = await apiGatewayClient.send(new GetResourcesCommand({ restApiId: apiId }))
    return response.items?.[0].id as string
  }

  async function createApiGatewayResource (apiId: string, parentId: string, functionName: string): Promise<string> {
    const response = await apiGatewayClient.send(new CreateResourceCommand({ restApiId: apiId, parentId, pathPart: functionName }))
    return response.id as string
  }

  async function createApiGatewayMethod (apiId: string, resourceId: string): Promise<void> {
    await apiGatewayClient.send(new PutMethodCommand({ restApiId: apiId, resourceId, httpMethod: 'ANY', authorizationType: 'NONE' }))
  }

  async function setLambdaIntegration (apiId: string, resourceId: string, region: string, lambdaArn: string): Promise<void> {
    const uri = `arn:aws:apigateway:${region}:lambda:path/2015-03-31/functions/${lambdaArn}/invocations`
    await apiGatewayClient.send(new PutIntegrationCommand({ restApiId: apiId, resourceId, type: 'AWS_PROXY', httpMethod: 'ANY', integrationHttpMethod: 'POST', uri }))
  }

  async function deployApi (apiId: string): Promise<void> {
    await apiGatewayClient.send(new CreateDeploymentCommand({ restApiId: apiId, stageName: 'prod' }))
  }

  return { createApiGateway, getApiGatewayRootResourceId, createApiGatewayResource, createApiGatewayMethod, setLambdaIntegration, deployApi }
}

export { createApiGatewayOperations }
