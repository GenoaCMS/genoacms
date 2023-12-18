import type Config from '@genoacms/cloudabstraction/src/genoa.config.js'

interface Credentials {
  type: string
  'project_id': string
  'private_key_id': string
  'private_key': string
  'client_email': string
  'client_id': string
  'auth_uri': string
  'token_uri': string
  'auth_provider_x509_cert_url': string
  'client_x509_cert_url': string
  'universe_domain': string
}

interface DatabaseConfig {
  credentials: Credentials
  databaseId: string
  region: string
}

interface StorageConfig {
  credentials: Credentials
  buckets: string[]
}

interface ConfigGCP extends Config<object, DatabaseConfig, StorageConfig> {}

export default Config
