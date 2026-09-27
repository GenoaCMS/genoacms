import type { SecretEncoding } from '@genoacms/contracts'
import type { ConfigIssue } from '../errors.js'
import type { AdapterKind } from '../manifest.js'
import { isPlainObject } from '../references.js'
import { resolveFromProject, importFromProject, packageNameOf, findPackageJson } from './project.js'

/** Where provider entries live, and the descriptor kind each place requires. */
const SERVICES: ReadonlyArray<{ stanza: string, collection: string, kind: AdapterKind }> = [
  { stanza: 'authentication', collection: 'providers', kind: 'authentication' },
  { stanza: 'database', collection: 'providers', kind: 'database' },
  { stanza: 'storage', collection: 'providers', kind: 'storage' },
  { stanza: 'secrets', collection: 'providers', kind: 'secrets' },
  { stanza: 'languages', collection: 'providers', kind: 'language' },
  { stanza: 'deployment', collection: 'targets', kind: 'deployment' }
]

const KINDS: ReadonlySet<string> = new Set(SERVICES.map(service => service.kind))

/** One entry under a providers or targets record, well-formed or not. */
interface ProviderSlot {
  readonly stanza: string
  readonly kind: AdapterKind
  readonly key: string
  /** e.g. 'storage.providers.gcs' */
  readonly path: string
  readonly value: unknown
}

interface WellFormedEntry { adapter: string, options: Record<string, unknown> }

/** A descriptor as loaded, before its shape is trusted. */
interface Descriptor {
  readonly kind: AdapterKind
  readonly runtime?: string
  readonly secretOptions?: Readonly<Record<string, SecretEncoding>>
  readonly developmentOnly?: boolean
  readonly validate?: (options: unknown) => string[]
  readonly svelteKitAdapter?: () => Promise<{ default: (options?: Record<string, unknown>) => unknown }>
  readonly svelteKitOptions?: (options: unknown, ctx: { outDir: string }) => Record<string, unknown>
  readonly procedure?: () => Promise<{ default: (options: unknown, ctx: unknown) => Promise<void> }>
}

interface LoadedDescriptor {
  readonly specifier: string
  readonly descriptor: Descriptor
  readonly packageName: string
  readonly version: string
}

type DescriptorResult = { ok: true, value: LoadedDescriptor } | { ok: false, issue: ConfigIssue }

function providerSlots (config: Record<string, unknown>): ProviderSlot[] {
  return SERVICES.flatMap(({ stanza, collection, kind }) => {
    const record = isPlainObject(config[stanza]) ? config[stanza][collection] : undefined
    if (!isPlainObject(record)) return []
    return Object.entries(record).map(([key, value]) => ({ stanza, kind, key, path: `${stanza}.${collection}.${key}`, value }))
  })
}

const isWellFormedEntry = (value: unknown): value is WellFormedEntry =>
  isPlainObject(value) && typeof value.adapter === 'string' && value.adapter !== '' && isPlainObject(value.options)

const firstLine = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).split('\n')[0]

/** Reasons a loaded module is not a usable descriptor. */
function descriptorShapeReasons (candidate: unknown): string[] {
  if (!isPlainObject(candidate)) return ['its default export is not a descriptor object']
  if (typeof candidate.kind !== 'string' || !KINDS.has(candidate.kind)) return [`kind ${JSON.stringify(candidate.kind)} is not a service kind`]
  if (candidate.kind === 'deployment') {
    return typeof candidate.svelteKitAdapter === 'function' && typeof candidate.procedure === 'function'
      ? []
      : ['a deployment descriptor needs svelteKitAdapter and procedure functions']
  }
  return typeof candidate.runtime === 'string' && candidate.runtime !== '' ? [] : ['runtime must be a non-empty bare specifier']
}

/**
 * Loads one descriptor from the project, with the package that owns it and its installed version.
 * The descriptor is SDK-free by contract, so this loads no SDK.
 */
async function loadDescriptor (specifier: string, root: string, path = ''): Promise<DescriptorResult> {
  let file: string
  let module: { default?: unknown }
  try {
    file = resolveFromProject(specifier, root)
    module = await importFromProject(specifier, root)
  } catch (error) {
    return { ok: false, issue: { code: 'config/descriptor-not-found', path, message: `cannot load ${specifier}: ${firstLine(error)}` } }
  }
  const reasons = descriptorShapeReasons(module.default)
  if (reasons.length > 0) {
    return { ok: false, issue: { code: 'config/descriptor-invalid', path, message: `${specifier}: ${reasons.join('; ')}` } }
  }
  const packageName = packageNameOf(specifier)
  const { version } = findPackageJson(file, packageName)
  return { ok: true, value: { specifier, descriptor: module.default as unknown as Descriptor, packageName, version } }
}

/** Every distinct descriptor the config names, loaded concurrently. Failures become issues. */
async function loadDescriptors (config: Record<string, unknown>, root: string): Promise<{ bySpecifier: Map<string, LoadedDescriptor>, issues: ConfigIssue[] }> {
  const firstPathOf = new Map<string, string>()
  for (const slot of providerSlots(config)) {
    if (isWellFormedEntry(slot.value) && !firstPathOf.has(slot.value.adapter)) firstPathOf.set(slot.value.adapter, `${slot.path}.adapter`)
  }
  const results = await Promise.all([...firstPathOf].map(async ([specifier, path]) => await loadDescriptor(specifier, root, path)))
  const bySpecifier = new Map<string, LoadedDescriptor>()
  const issues: ConfigIssue[] = []
  for (const result of results) {
    if (result.ok) bySpecifier.set(result.value.specifier, result.value)
    else issues.push(result.issue)
  }
  return { bySpecifier, issues }
}

export { loadDescriptor, loadDescriptors, providerSlots, isWellFormedEntry, SERVICES }
export type { LoadedDescriptor, Descriptor, ProviderSlot, WellFormedEntry }
