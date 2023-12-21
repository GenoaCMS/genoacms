import type Config from '@genoacms/cloudabstraction/src/genoa.config.d.ts'

interface DatabaseConfig {
  region: string
}

interface StorageConfig {
  buckets: string[]
  region: string
}

interface ConfigAWS extends Config<object, DatabaseConfig, StorageConfig> {}

export type {
  Bucket
}
export default ConfigAWS
