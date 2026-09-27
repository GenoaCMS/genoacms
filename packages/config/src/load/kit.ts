import { join } from 'node:path'
import type { SvelteKitAdapterFactory } from '@genoacms/contracts'
import { singleIssueError } from '../errors.js'
import { importFromProject } from './project.js'
import { loadConfig } from './index.js'
import type { Descriptor } from './descriptors.js'

interface KitAdapterRequest {
  root: string
  file?: string
  mode: 'development' | 'production'
  /** Target name. Fallback: deployment.default, then the first key of deployment.targets. */
  target?: string
}

type KitAdapter = ReturnType<SvelteKitAdapterFactory>

function chooseTarget (targets: Record<string, unknown>, requested: string | undefined, fallback: string | undefined): string {
  const name = requested ?? fallback ?? Object.keys(targets)[0]
  if (Object.hasOwn(targets, name)) return name
  throw singleIssueError('config/unknown-target', 'deployment.targets', `${name} is not a deployment target; known: ${Object.keys(targets).join(', ')}`)
}

/**
 * The SvelteKit adapter instance for a deployment target, or undefined when the config declares
 * none: the dev server needs no adapter, and a `vite build` without a target only gets SvelteKit's
 * usual warning. Options reach the descriptor unresolved; credentials never influence the build.
 */
async function resolveKitAdapter (request: KitAdapterRequest): Promise<KitAdapter | undefined> {
  const manifest = await loadConfig({ root: request.root, file: request.file, mode: request.mode })
  const targets = manifest.config.deployment?.targets ?? {}
  if (Object.keys(targets).length === 0) {
    if (request.target !== undefined) throw singleIssueError('config/no-deployment-target', 'deployment.targets', `target ${request.target} was requested and the config declares none`)
    return undefined
  }
  const entry = targets[chooseTarget(targets, request.target, manifest.config.deployment?.default)]
  const descriptor = (await importFromProject<{ default: Descriptor }>(entry.adapter, request.root)).default
  const factory = (await (descriptor.svelteKitAdapter as NonNullable<Descriptor['svelteKitAdapter']>)()).default as SvelteKitAdapterFactory
  const outDir = join(request.root, '.genoacms', 'build')
  return factory(descriptor.svelteKitOptions?.(entry.options, { outDir }) ?? {})
}

export { resolveKitAdapter }
export type { KitAdapterRequest }
