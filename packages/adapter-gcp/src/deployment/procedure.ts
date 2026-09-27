import { join } from 'node:path'
import { defineDeployProcedure } from '@genoacms/contracts'
import type { GcpDeploymentOptions } from './descriptor.js'
import { stageArtifact, zipDirectory } from './archive.js'
import { createFunctionsClient, uploadArchive, deployFunction } from './functions.js'

const DEFAULT_FUNCTION_NAME = 'genoacms'

/** Uploads the build artifact and creates or updates the Cloud Run function serving it. */
export default defineDeployProcedure<GcpDeploymentOptions>(async (options, ctx) => {
  const app = await stageArtifact(ctx.buildDir, join(ctx.workDir, 'app'))
  const archive = await zipDirectory(app, join(ctx.workDir, 'build.zip'))
  const client = createFunctionsClient(options.credentials)
  const storageSource = await uploadArchive(client, options.projectId, options.region, archive)
  await deployFunction(client, { projectId: options.projectId, region: options.region, functionName: options.functionName ?? DEFAULT_FUNCTION_NAME }, storageSource)
})
