import { mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { spinner } from '@clack/prompts'
import { importFromProject } from '@genoacms/config/load'
import { createHost } from '@genoacms/config/host'
import { build } from './build.js'

/** Always under `<root>/.genoacms/deploy/`: the procedure is promised an empty directory it owns. */
async function freshDirectory (path) {
  await rm(path, { recursive: true, force: true })
  await mkdir(path, { recursive: true })
  return path
}

const FAILED = 2

/** CLI-8, LF11 */
async function phase (started, done, work) {
  const progress = spinner()
  progress.start(started)
  try {
    const result = await work()
    progress.stop(done)
    return result
  } catch (error) {
    progress.stop(`${started} failed`, FAILED)
    throw error
  }
}

const buildPhase = (ctx) => phase('Building CMS code', 'CMS code built', () => build(ctx))

/**
 * Target options are resolved on the operator's machine through the configured secrets store, as
 * the runtime would resolve provider options. They never enter the build.
 */
function resolvePhase (host, built, descriptor) {
  const entry = built.manifest.config.deployment.targets[built.target]
  return phase('Resolving deployment options', 'Deployment options resolved', () =>
    host.resolve(entry.options, descriptor.secretOptions ?? {}, `deployment.targets.${built.target}.options`))
}

function deployPhase (root, built, descriptor, options) {
  return phase('Deploying code', 'Code deployed', async () => {
    const workDir = await freshDirectory(join(root, '.genoacms', 'deploy', built.target))
    const procedure = (await descriptor.procedure()).default
    await procedure(options, { projectRoot: root, buildDir: built.buildDir, workDir, target: built.target })
  })
}

async function deploy (ctx) {
  const built = await buildPhase(ctx)
  const entry = built.manifest.config.deployment.targets[built.target]
  const descriptor = (await importFromProject(entry.adapter, ctx.root)).default
  const host = createHost({ manifest: built.manifest, load: s => importFromProject(s, ctx.root), projectRoot: ctx.root })
  try {
    const options = await resolvePhase(host, built, descriptor)
    await deployPhase(ctx.root, built, descriptor, options)
  } finally {
    await host.close()
  }
}

export default deploy
