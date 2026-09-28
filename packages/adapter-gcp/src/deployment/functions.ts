import type { google } from '@google-cloud/functions/build/protos/protos.js'
import { createReadStream } from 'node:fs'
import { v2 } from '@google-cloud/functions'
import type { ServiceAccount } from '../shared/serviceAccount.js'
import { buildConfig, serviceConfig, type FunctionSettings } from './settings.js'
type IStorageSource = google.cloud.functions.v2.IStorageSource
type ICloudFunction = google.cloud.functions.v2.IFunction

const GRPC_NOT_FOUND = 5
type FunctionServiceClient = InstanceType<typeof v2.FunctionServiceClient>

interface FunctionTarget {
  projectId: string
  region: string
  functionName: string
}

// DEP-13
function createFunctionsClient (credentials?: ServiceAccount): FunctionServiceClient {
  return new v2.FunctionServiceClient(credentials === undefined ? {} : { credentials })
}

async function uploadArchive (client: FunctionServiceClient, projectId: string, region: string, archivePath: string): Promise<IStorageSource> {
  const location = client.locationPath(projectId, region)
  const [urlResponse] = await client.generateUploadUrl({ parent: location })
  const uploadUrl = urlResponse.uploadUrl
  const storageSource = urlResponse.storageSource
  if (!uploadUrl || !storageSource) throw new Error('Upload URL not found')
  const sourceArchiveStream = createReadStream(archivePath)
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    // @ts-expect-error: invalid typings
    body: sourceArchiveStream,
    duplex: 'half',
    headers: {
      'Content-Type': 'application/zip'
    }
  })
  if (!response.ok) throw new Error(`deploy/upload-failed: ${response.status} ${response.statusText}`)
  return storageSource
}

// DEP-9
async function functionExists (client: FunctionServiceClient, name: string): Promise<boolean> {
  try {
    await client.getFunction({ name })
    return true
  } catch (error) {
    if ((error as { code?: number }).code === GRPC_NOT_FOUND) return false
    throw error
  }
}

// DEP-11, GD1
async function completeOperation (operation: { promise: () => Promise<unknown[]> }): Promise<ICloudFunction> {
  try {
    const [result] = await operation.promise()
    return result as ICloudFunction
  } catch (error) {
    throw new Error(`deploy/function-failed: ${(error as Error).message}`, { cause: error })
  }
}

// DEP-10, DEP-12, GD1
async function deployFunction (client: FunctionServiceClient, { projectId, region, functionName }: FunctionTarget, storageSource: IStorageSource, settings: FunctionSettings): Promise<string | undefined> {
  const name = client.functionPath(projectId, region, functionName)
  const request = {
    functionId: functionName,
    parent: client.locationPath(projectId, region),
    function: { name, buildConfig: buildConfig(settings, storageSource), serviceConfig: serviceConfig(settings) }
  }
  const [operation] = await functionExists(client, name)
    ? await client.updateFunction(request)
    : await client.createFunction(request)
  const result = await completeOperation(operation)
  return result.url ?? result.serviceConfig?.uri ?? undefined
}

export { createFunctionsClient, uploadArchive, deployFunction }
export type { FunctionTarget, FunctionServiceClient }
