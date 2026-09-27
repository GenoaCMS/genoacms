import type { SerializedConfig } from '../config.js'
import type { AdapterRecord, Manifest } from '../manifest.js'
import type { EvaluatedConfig } from './evaluate.js'
import type { LoadedDescriptor } from './descriptors.js'

function adapterRecord ({ descriptor, packageName, version }: LoadedDescriptor): AdapterRecord {
  return {
    kind: descriptor.kind,
    ...(descriptor.kind === 'deployment' ? {} : { runtime: descriptor.runtime }),
    secretOptions: { ...(descriptor.secretOptions ?? {}) },
    developmentOnly: descriptor.developmentOnly === true,
    package: packageName,
    version
  }
}

/** The manifest of a config that passed every rule. `source` exists only in development. */
function buildManifest (
  evaluated: EvaluatedConfig,
  descriptors: ReadonlyMap<string, LoadedDescriptor>,
  mode: Manifest['mode'],
  root: string,
  file: string
): Manifest {
  return {
    version: 1,
    mode,
    config: structuredClone(evaluated.value) as unknown as SerializedConfig,
    adapters: Object.fromEntries([...descriptors].map(([specifier, loaded]) => [specifier, adapterRecord(loaded)])),
    ...(mode === 'development' ? { source: { root, file, dependencies: evaluated.dependencies } } : {})
  }
}

export { buildManifest }
