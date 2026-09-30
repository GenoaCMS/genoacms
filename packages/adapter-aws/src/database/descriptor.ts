import { defineDatabaseAdapter, type Secret } from '@genoacms/contracts'
import { unknownOptions, requireString, type AwsCredentials } from '../shared.js'

export interface AwsDatabaseOptions {
  region: string
  /** Omitted: the SDK's default credential provider chain. */
  credentials?: Secret<AwsCredentials>
}

declare module '@genoacms/contracts' {
  interface DatabaseAdapters { '@genoacms/adapter-aws/database': AwsDatabaseOptions }
}

export default defineDatabaseAdapter<AwsDatabaseOptions>({
  runtime: '@genoacms/adapter-aws/database/runtime',
  secretOptions: { credentials: 'json' },
  validate: options => [...unknownOptions(options, ['region', 'credentials']), ...requireString(options, 'region')]
})
