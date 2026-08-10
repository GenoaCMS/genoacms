import type { Config as ConfigG } from '@genoacms/cloudabstraction/src/genoa.config.js'
import type { AuthorizationProvider as AuthorizationProviderG } from '@genoacms/cloudabstraction/authorization'
import type { DatabaseProvider as DatabaseProviderG } from '@genoacms/cloudabstraction/database'
import type { DeploymentProvider as DeploymentProviderG } from '@genoacms/cloudabstraction/deployment'
import type { StorageProvider as StorageProviderG } from '@genoacms/cloudabstraction/storage'

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

interface AuthorizationProvider extends AuthorizationProviderG {
  projectId: string
  credentials: Credentials
}

interface DatabaseProvider extends DatabaseProviderG {
  projectId: string
  credentials: Credentials
  databaseId: string
  region: string
}
interface DeploymentProvider extends DeploymentProviderG {
  projectId: string
  credentials: Credentials
  region: string
  functionName: string
}

interface StorageProvider extends StorageProviderG {
  credentials: Credentials
}

interface Config extends ConfigG<object, AuthorizationProvider, DatabaseProvider, StorageProvider> {}

export type {
  Config,
  AuthorizationProvider,
  DatabaseProvider,
  DeploymentProvider,
  StorageProvider
}
