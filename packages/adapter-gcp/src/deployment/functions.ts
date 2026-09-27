import type { google } from '@google-cloud/functions/build/protos/protos.js'
import { createReadStream } from 'node:fs'
import { v2 } from '@google-cloud/functions'
import type { ServiceAccount } from '../shared/serviceAccount.js'
type IStorageSource = google.cloud.functions.v2.IStorageSource
type FunctionServiceClient = InstanceType<typeof v2.FunctionServiceClient>

interface FunctionTarget {
  projectId: string
  region: string
  functionName: string
}

/** Omitted credentials: Application Default Credentials of the operator's machine. */
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
  await fetch(uploadUrl, {
    method: 'PUT',
    // @ts-expect-error: invalid typings
    body: sourceArchiveStream,
    duplex: 'half',
    headers: {
      'Content-Type': 'application/zip'
    }
  })
  return storageSource
}

async function deployFunction (client: FunctionServiceClient, { projectId, region, functionName }: FunctionTarget, storageSource: IStorageSource): Promise<void> {
  const location = client.locationPath(projectId, region)
  const name = client.functionPath(projectId, region, functionName)
  let isFunctionExisting: boolean
  try {
    await client.getFunction({ name })
    isFunctionExisting = true
  } catch (error) {
    isFunctionExisting = false
  }
  const operationParams = {
    functionId: functionName,
    parent: location,
    function: {
      name,
      buildConfig: {
        entryPoint: 'genoacms',
        runtime: 'nodejs20',
        source: {
          storageSource
        }
      },
      serviceConfig: {
        minInstanceCount: 0,
        maxInstanceCount: 1,
        ingressSettings: 1, // ALLOW_ALL
        environmentVariables: {
          NODE_ENV: 'production'
        }
      }
    }
  }
  let response
  if (isFunctionExisting) {
    [response] = await client.updateFunction(operationParams)
  } else {
    [response] = await client.createFunction(operationParams)
  }
  console.log(response)
}

export { createFunctionsClient, uploadArchive, deployFunction }
export type { FunctionTarget, FunctionServiceClient }
