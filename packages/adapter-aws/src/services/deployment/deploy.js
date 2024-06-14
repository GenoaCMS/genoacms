import { LambdaClient, CreateFunctionCommand, GetFunctionCommand, UpdateFunctionCodeCommand } from '@aws-sdk/client-lambda'
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3'
import { config } from '@genoacms/cloudabstraction'
import { createReadStream, createWriteStream } from 'node:fs'
import { resolve, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import archiver from 'archiver'

const client = new LambdaClient({
  region: config.deployment.region,
  credentials: config.deployment.credentials
})
const s3client = new S3Client({
  region: config.deployment.region,
  credentials: config.deployment.credentials
})
const deploymentRole = config.deployment.role

const currentDir = dirname(fileURLToPath(import.meta.url))

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
 * @param {string} FunctionName
 * @returns {Promise<boolean>}
 * */
async function isLambdaExisting (functionName) {
  try {
    await client.send(new GetFunctionCommand({
      FunctionName: functionName
    }))
    return true
  } catch (error) {
    return false
  }
}

/**
  * @param {string} functionName
  * @param {string} sourcePath
  * @returns {Promise<void>}
  */
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
  const isExisting = await isLambdaExisting(functionName)
  let command
  if (isExisting) {
    command = new UpdateFunctionCodeCommand(params)
  } else {
    command = new CreateFunctionCommand(params)
  }
  const data = await client.send(command)
}

export async function deploy () {
  console.log('deploying')
  const buildDirectoryPath = '**'
  const buildArchivePath = resolve(currentDir, '../../../deployment/build.zip')
  const functionEntryScriptPath = resolve(currentDir, '../../../deployment/snippets/index.js')
  const ignoreArchivePaths = [
    'node_modules/**',
    '.git/**',
    '.github/**',
    '.gitignore'
    // 'build/**'
  ]
  const injectArchivePaths = [
    functionEntryScriptPath
  ]
  await createZip(buildDirectoryPath, injectArchivePaths, ignoreArchivePaths, buildArchivePath)
  const functionStoragePath = await uploadSource(buildArchivePath)
  createLambda('genoacms', functionStoragePath)
  console.log('deployed')
}
