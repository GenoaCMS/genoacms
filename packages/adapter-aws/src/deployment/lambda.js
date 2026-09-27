import {
  CreateFunctionCommand,
  GetFunctionCommand,
  UpdateFunctionCodeCommand,
  AddPermissionCommand,
  GetFunctionUrlConfigCommand
} from '@aws-sdk/client-lambda'

/**
 * Today's Lambda steps. What they read from the global config — the role, the region, the account id
 * and the bucket holding the archive — is now the deployment target's options.
 *
 * @param {{
 *   lambdaClient: import('@aws-sdk/client-lambda').LambdaClient,
 *   apiGateway: ReturnType<typeof import('./apiGateway.js').createApiGatewayOperations>,
 *   options: { role: string, region: string, accountId: string, artifactBucket: string }
 * }} deps
 */
function createLambdaOperations ({ lambdaClient, apiGateway, options }) {
  const {
    createApiGateway,
    getApiGatewayRootResourceId,
    createApiGatewayResource,
    createApiGatewayMethod,
    setLambdaIntegration,
    deployApi
  } = apiGateway
  const deploymentRole = options.role
  const region = options.region
  const accountId = options.accountId

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
      Handler: 'index.handler',
      Role: deploymentRole,
      Runtime: 'nodejs20.x',
      Code: {
        S3Bucket: options.artifactBucket,
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
    await setLambdaIntegration(apiId, resourceId, region, lambdaArn)
    console.info('Deploying api gateway')
    await deployApi(apiId)
    console.info('Adding lambda invoke permission')
    await addLambdaInvokePermission(apiId, functionName, accountId, region)
  }

  async function updateLambda (functionName, sourcePath) {
    const params = {
      FunctionName: functionName,
      S3Bucket: options.artifactBucket,
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
    return response.FunctionArn
  }

  /**
   * @param {string} apiId
   * @param {string} functionName
   * @param {string} accountId
   * @param {string} region
   * @returns {Promise<void>}
   */
  async function addLambdaInvokePermission (apiId, functionName, accountId, region) {
    const addPermissionCommand = new AddPermissionCommand({
      FunctionName: functionName,
      StatementId: 'apigateway-access',
      Action: 'lambda:InvokeFunction',
      Principal: 'apigateway.amazonaws.com',
      SourceArn: `arn:aws:execute-api:${region}:${accountId}:${apiId}/prod/*/GET/${functionName}`
    })

    await lambdaClient.send(addPermissionCommand)
  }

  return { createOrUpdateLambda }
}

export { createLambdaOperations }
