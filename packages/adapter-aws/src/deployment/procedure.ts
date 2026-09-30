import { createReadStream } from 'node:fs'
import { join } from 'node:path'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { LambdaClient } from '@aws-sdk/client-lambda'
import { defineDeployProcedure } from '@genoacms/contracts'
import { clientConfig, type AwsCredentials } from '../shared.js'
import type { AwsDeploymentOptions } from './descriptor.js'
import { DEFAULT_FUNCTION_NAME } from './settings.js'
import { installProductionDependencies, stageLambdaApp, zipDirectory } from './stage.js'
import { createFunctionOperations } from './functions.js'

type ResolvedOptions = Omit<AwsDeploymentOptions, 'credentials'> & { credentials?: AwsCredentials }

const archiveKey = (functionName: string): string => `.genoacms/deployment/${functionName}.zip`

// LMB-7
async function uploadArchive (s3: S3Client, bucket: string, key: string, archive: string): Promise<void> {
  try {
    await s3.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: createReadStream(archive) }))
  } catch (error) {
    throw new Error(`deploy/upload-failed: ${(error as Error).message}`, { cause: error })
  }
}

// LMB-4 to LMB-14
export default defineDeployProcedure<AwsDeploymentOptions>(async (options, ctx) => {
  const resolved = options as unknown as ResolvedOptions
  const functionName = resolved.functionName ?? DEFAULT_FUNCTION_NAME
  const config = clientConfig(resolved.region, resolved.credentials)
  const app = await stageLambdaApp(ctx.buildDir, join(ctx.workDir, 'app'))
  await installProductionDependencies(app)
  const archive = await zipDirectory(app, join(ctx.workDir, 'build.zip'))
  const key = archiveKey(functionName)
  await uploadArchive(new S3Client(config), resolved.artifactBucket, key, archive)
  const operations = createFunctionOperations(new LambdaClient(config), { ...resolved, functionName }, key)
  if (await operations.lookup()) await operations.update()
  else await operations.create()
  const url = await operations.functionUrl()
  if (url !== undefined) console.info(`Function URL: ${url}`)
})
