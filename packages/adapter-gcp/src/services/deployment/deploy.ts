import config from '../../config.js'
import { createReadStream, createWriteStream } from 'node:fs'
import { resolve, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { v2 } from '@google-cloud/functions'
import archiver from 'archiver'
import type { google } from '@google-cloud/functions/build/protos/protos.js'
type IStorageSource = google.cloud.functions.v2.IStorageSource

const { FunctionServiceClient } = v2
const functionsClient = new FunctionServiceClient({
  credentials: config.deployment.credentials
})
const projectId = config.deployment.projectId
const region = config.deployment.region

const currentDir = dirname(fileURLToPath(import.meta.url))

async function createZip (source: string, injectPaths: string[], ignorePaths: string[], out: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
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

async function uploadSource (sourceArchivePath: string): Promise<IStorageSource> {
  const location = functionsClient.locationPath(projectId, region)
  const [urlResponse] = await functionsClient.generateUploadUrl({ parent: location })
  const uploadUrl = urlResponse.uploadUrl
  const storageSource = urlResponse.storageSource
  if (!uploadUrl || !storageSource) throw new Error('Upload URL not found')
  const sourceArchiveStream = createReadStream(sourceArchivePath)
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

async function deployFunction (functionName: string, storageSource: IStorageSource): Promise<void> {
  const location = functionsClient.locationPath(projectId, region)
  const name = functionsClient.functionPath(projectId, region, functionName)
  let isFunctionExisting: boolean
  try {
    await functionsClient.getFunction({ name })
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
    [response] = await functionsClient.updateFunction(operationParams)
  } else {
    [response] = await functionsClient.createFunction(operationParams)
  }
  console.log(response)
}

async function deploy (): Promise<void> {
  const buildDirectoryPath = '**'
  const buildArchivePath = resolve(currentDir, '../../../deployment/build.zip')
  const functionEntryScriptPath = resolve(currentDir, '../../../deployment/snippets/index.js')
  const ignoreArchivePaths = [
    'node_modules/**',
    '.git/**',
    '.github/**',
    '.gitignore',
    'build/**'
  ]
  const injectArchivePaths = [
    functionEntryScriptPath
  ]
  await createZip(buildDirectoryPath, injectArchivePaths, ignoreArchivePaths, buildArchivePath)
  const functionStorageSource = await uploadSource(buildArchivePath)
  await deployFunction('genoacms', functionStorageSource)
}

export default deploy
