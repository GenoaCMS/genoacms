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

async function buildPhase (ctx) {
  const building = spinner()
  building.start('Building CMS code')
  const built = await build(ctx)
  building.stop('CMS code built')
  return built
}

/**
 * Target options are resolved on the operator's machine through the configured secrets store, as
 * the runtime would resolve provider options. They never enter the build.
 */
async function resolvePhase (host, built, descriptor) {
  const resolving = spinner()
  resolving.start('Resolving deployment options')
  const entry = built.manifest.config.deployment.targets[built.target]
  const options = await host.resolve(entry.options, descriptor.secretOptions ?? {}, `deployment.targets.${built.target}.options`)
  resolving.stop('Deployment options resolved')
  return options
}

async function deployPhase (root, built, descriptor, options) {
  const deploying = spinner()
  deploying.start('Deploying code')
  const workDir = await freshDirectory(join(root, '.genoacms', 'deploy', built.target))
  const procedure = (await descriptor.procedure()).default
  await procedure(options, { projectRoot: root, buildDir: built.buildDir, workDir, target: built.target })
  deploying.stop('Code deployed')
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
