import {
  LambdaClient,
  CreateFunctionCommand,
  GetFunctionCommand,
  UpdateFunctionCodeCommand,
  AddPermissionCommand,
  GetFunctionUrlConfigCommand
} from '@aws-sdk/client-lambda'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
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
import { createReadStream, createWriteStream } from 'node:fs'
import { resolve, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import archiver from 'archiver'

const lambdaClient = new LambdaClient({
  region: config.deployment.region,
  credentials: config.deployment.credentials
})
const s3client = new S3Client({
  region: config.deployment.region,
  credentials: config.deployment.credentials
})
const apiGatewayClient = new APIGatewayClient({
  region: config.deployment.region,
  credentials: config.deployment.credentials
})
const deploymentRole = config.deployment.role

const currentDir = dirname(fileURLToPath(import.meta.url))
const functionName = config.deployment.functionName || 'genoacms'
const buildDirectoryPath = 'build/**'
const accessKeyId = config.deployment.credentials.accessKeyId
const region = config.deployment.region
const buildArchivePath = resolve(currentDir, '../../../deployment/build.zip')
const functionEntryScriptPath = resolve(currentDir, '../../../deployment/snippets/index.js')
const ignoreArchivePaths = [
  'node_modules/**',
  '.genoacms/**',
  '.git/**',
  '.github/**',
  '.gitignore'
  // 'build/**'
]
const injectArchivePaths = [
  functionEntryScriptPath
]

/**
  * @param {string} source
  * @param {string[]} injectPaths
  * @param {string[]} ignorePaths
  * @param {string} out
  * @returns {Promise<void>}
  */
async function createZip (source, injectPaths, ignorePaths, out) {
  await new Promise((resolve, reject) => {
    const output = createWriteStream(out)
    const archive = archiver('zip', { zlib: { level: 9 } })

    output.on('close', () => {
      resolve()
    })

    archive.on('error', (err) => {
      reject(err)
    })

    archive.pipe(output)
    archive.glob(source, { ignore: ignorePaths })
    for (const path of injectPaths) {
      archive.file(path, { name: basename(path) })
    }
    archive.finalize()
  })
}

/**
  * @param {string} sourcePath
  * @returns {Promise<string>}
  */
async function uploadSource (sourcePath) {
  const destinationPath = '.genoacms/deployment/build.zip'
  const command = new PutObjectCommand({
    Bucket: config.storage.defaultBucket,
    Key: destinationPath,
    Body: createReadStream(sourcePath)
  })

  try {
    await s3client.send(command)
  } catch (err) {
    throw new Error('upload-failed')
  }
  return destinationPath
}

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

export async function deploy () {
  console.info('Creating deployment .zip package')
  await createZip(buildDirectoryPath, injectArchivePaths, ignoreArchivePaths, buildArchivePath)
  console.info('Uploading archive to S3')
  const functionStoragePath = await uploadSource(buildArchivePath)
  await createOrUpdateLambda(functionName, functionStoragePath)
  console.info('Deployment finished!')
}
deploy()
