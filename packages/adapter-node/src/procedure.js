import { cp } from 'node:fs/promises'
import { resolve, relative, isAbsolute } from 'node:path'
import { defineDeployProcedure } from '@genoacms/contracts'

/**
 * Refuses a target outside the project even if validation was bypassed: copying over it must never
 * reach the project root itself or anything above it.
 *
 * @param {string} projectRoot
 * @param {string} target
 */
function assertInsideProject (projectRoot, target) {
  const path = relative(projectRoot, target)
  if (path === '' || path.startsWith('..') || isAbsolute(path)) throw new Error('deploy/out-dir-outside-project')
}

/**
 * Copies the artifact, with its generated package.json, to `outDir`. Nothing is deleted first:
 * a copy over an existing directory is what the previous deploy did, and deleting a misconfigured
 * directory could delete the project.
 */
export default defineDeployProcedure(async ({ outDir = 'build' }, ctx) => {
  const target = resolve(ctx.projectRoot, outDir)
  assertInsideProject(ctx.projectRoot, target)
  await cp(ctx.buildDir, target, { recursive: true, force: true })
  console.info(`GenoaCMS copied to ${target}. Install its runtime dependencies there with: npm install --omit=dev`)
})
