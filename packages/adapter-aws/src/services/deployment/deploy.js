import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { config } from '@genoacms/cloudabstraction'
import { createZip } from './archive.js'
import { uploadSource } from './s3.js'
import { createOrUpdateLambda } from './lambda.js'

const currentDir = dirname(fileURLToPath(import.meta.url))
const functionName = config.deployment.functionName || 'genoacms'
const buildDirectoryPath = 'build'
const buildArchivePath = resolve(currentDir, '../../../deployment/build.zip')
const functionEntryScriptPath = resolve(currentDir, '../../../deployment/snippets/index.js')
const packageJsonScriptPath = resolve(currentDir, '../../../deployment/snippets/package.json')
const packageLockJsonScriptPath = resolve(currentDir, '../../../deployment/snippets/package-lock.json')

const injectArchivePaths = [
  functionEntryScriptPath,
  packageJsonScriptPath,
  packageLockJsonScriptPath
]

export async function deploy () {
  console.info('Creating deployment .zip package')
  await createZip(buildDirectoryPath, injectArchivePaths, buildArchivePath)
  console.info('Uploading archive to S3')
  const functionStoragePath = await uploadSource(buildArchivePath)
  await createOrUpdateLambda(functionName, functionStoragePath)
  console.info('Deployment finished!')
}
deploy()
