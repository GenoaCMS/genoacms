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

interface KitTarget {
  /** The target's SvelteKit adapter instance; undefined when the config declares no target. */
  readonly adapter: KitAdapter | undefined
  /** The descriptor's origin for the target's options, given to SvelteKit as `paths.origin`. */
  readonly origin: string | undefined
}

const NO_TARGET: KitTarget = { adapter: undefined, origin: undefined }

function chooseTarget (targets: Record<string, unknown>, requested: string | undefined, fallback: string | undefined): string {
  const name = requested ?? fallback ?? Object.keys(targets)[0]
  if (Object.hasOwn(targets, name)) return name
  throw singleIssueError('config/unknown-target', 'deployment.targets', `${name} is not a deployment target; known: ${Object.keys(targets).join(', ')}`)
}

async function adapterOf (descriptor: Descriptor, options: unknown, root: string): Promise<KitAdapter> {
  const factory = (await (descriptor.svelteKitAdapter as NonNullable<Descriptor['svelteKitAdapter']>)()).default as SvelteKitAdapterFactory
  const outDir = join(root, '.genoacms', 'build')
  return factory(descriptor.svelteKitOptions?.(options, { outDir }) ?? {})
}

/**
 * The SvelteKit adapter and origin for a deployment target, or neither when the config declares
 * no target: the dev server needs no adapter, and a `vite build` without a target only gets
 * SvelteKit's usual warning. Options reach the descriptor unresolved; credentials never influence
 * the build (build.md D10, D11).
 */
async function resolveKitTarget (request: KitAdapterRequest): Promise<KitTarget> {
  const manifest = await loadConfig({ root: request.root, file: request.file, mode: request.mode })
  const targets = manifest.config.deployment?.targets ?? {}
  if (Object.keys(targets).length === 0) {
    if (request.target !== undefined) throw singleIssueError('config/no-deployment-target', 'deployment.targets', `target ${request.target} was requested and the config declares none`)
    return NO_TARGET
  }
  const entry = targets[chooseTarget(targets, request.target, manifest.config.deployment?.default)]
  const descriptor = (await importFromProject<{ default: Descriptor }>(entry.adapter, request.root)).default
  return {
    adapter: await adapterOf(descriptor, entry.options, request.root),
    origin: descriptor.origin?.(entry.options)
  }
}

export { resolveKitTarget }
export type { KitAdapterRequest, KitTarget }
