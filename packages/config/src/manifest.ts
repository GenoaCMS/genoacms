import type { SecretEncoding } from '@genoacms/contracts'
import type { SerializedConfig } from './config.js'

type AdapterKind = 'storage' | 'database' | 'authentication' | 'secrets' | 'language' | 'deployment'

/** What the host needs about one adapter without loading its descriptor again. */
interface AdapterRecord {
  readonly kind: AdapterKind
  /** Bare specifier of the runtime module. Absent for deployment targets. */
  readonly runtime?: string
  readonly secretOptions: Readonly<Record<string, SecretEncoding>>
  readonly developmentOnly: boolean
  /** npm package that owns the descriptor, and its installed version. */
  readonly package: string
  readonly version: string
}

interface Manifest {
  readonly version: 1
  readonly mode: 'development' | 'production'
  readonly config: SerializedConfig
  /** Keyed by descriptor specifier. */
  readonly adapters: Readonly<Record<string, AdapterRecord>>
  /** Development only. `dependencies` includes the config file itself. */
  readonly source?: { readonly root: string, readonly file: string, readonly dependencies: readonly string[] }
}

/** Embedded in the server bundle: no deployment stanza, no deployment adapters, no watch list. */
interface RuntimeManifest {
  readonly version: 1
  readonly mode: 'development' | 'production'
  readonly config: Omit<SerializedConfig, 'deployment'>
  readonly adapters: Readonly<Record<string, AdapterRecord>>
  readonly source?: { readonly root: string, readonly file: string }
}

const withoutDeploymentAdapters = (adapters: Manifest['adapters']): Record<string, AdapterRecord> =>
  Object.fromEntries(Object.entries(adapters).filter(([, record]) => record.kind !== 'deployment'))

/**
 * The subset of a manifest that ships inside a build.
 *
 * Deployment options are used by `genoa deploy` on the operator's machine, so they never enter the
 * artifact, and neither does anything an inline credential there might hold.
 */
function toRuntimeManifest (manifest: Manifest): RuntimeManifest {
  const { deployment, ...config } = manifest.config
  return {
    version: manifest.version,
    mode: manifest.mode,
    config,
    adapters: withoutDeploymentAdapters(manifest.adapters),
    ...(manifest.source === undefined ? {} : { source: { root: manifest.source.root, file: manifest.source.file } })
  }
}

export { toRuntimeManifest }
export type { Manifest, RuntimeManifest, AdapterRecord, AdapterKind }
