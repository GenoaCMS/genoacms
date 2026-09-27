import { defineStorageAdapter, type Secret } from '@genoacms/contracts'
import { unknownOptions, requireString, type ServiceAccount } from '../shared/serviceAccount.js'

export interface GcpStorageOptions {
  projectId: string
  /** Omitted: Application Default Credentials, i.e. the runtime's own identity. */
  credentials?: Secret<ServiceAccount>
}

declare module '@genoacms/contracts' {
  interface StorageAdapters { '@genoacms/adapter-gcp/storage': GcpStorageOptions }
}

export default defineStorageAdapter<GcpStorageOptions>({
  runtime: '@genoacms/adapter-gcp/storage/runtime',
  secretOptions: { credentials: 'json' },
  validate: options => [...unknownOptions(options, ['projectId', 'credentials']), ...requireString(options, 'projectId')]
})
