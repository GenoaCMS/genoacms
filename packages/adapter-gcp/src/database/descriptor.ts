import { defineDatabaseAdapter, type Secret } from '@genoacms/contracts'
import { unknownOptions, requireString, type ServiceAccount } from '../shared/serviceAccount.js'

export interface GcpDatabaseOptions {
  projectId: string
  /** Default '(default)'. */
  databaseId?: string
  /** Omitted: Application Default Credentials, i.e. the runtime's own identity. */
  credentials?: Secret<ServiceAccount>
}

declare module '@genoacms/contracts' {
  interface DatabaseAdapters { '@genoacms/adapter-gcp/database': GcpDatabaseOptions }
}

export default defineDatabaseAdapter<GcpDatabaseOptions>({
  runtime: '@genoacms/adapter-gcp/database/runtime',
  secretOptions: { credentials: 'json' },
  validate: options => [...unknownOptions(options, ['projectId', 'databaseId', 'credentials']), ...requireString(options, 'projectId')]
})
