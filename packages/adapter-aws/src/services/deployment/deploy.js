import { resolve, join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { config } from '@genoacms/cloudabstraction'
import { createZip } from './archive.js'
import { uploadSource } from './s3.js'
import { createOrUpdateLambda } from './lambda.js'
import { installAssetsDependencies } from './assets.js'

const currentDir = dirname(fileURLToPath(import.meta.url))
const functionName = config.deployment.functionName || 'genoacms'
const buildDirectoryPath = 'build'
const adapterDirectoryPath = resolve(currentDir, '../../../')
const assetsDirectoryPath = join(adapterDirectoryPath, 'deployment', 'assets/')
const buildArchivePath = join(adapterDirectoryPath, 'deployment', 'build.zip')

const ignorePaths = [
  'index.js'
]

export async function deploy () {
  console.info('Installing dependencies of injected assets')
  installAssetsDependencies(assetsDirectoryPath)
  console.info('Creating deployment .zip package')
  await createZip(buildDirectoryPath, assetsDirectoryPath, ignorePaths, buildArchivePath)
  console.info('Uploading archive to S3')
  const functionStoragePath = await uploadSource(buildArchivePath)
  await createOrUpdateLambda(functionName, functionStoragePath)
  console.info('Deployment finished!')
}
