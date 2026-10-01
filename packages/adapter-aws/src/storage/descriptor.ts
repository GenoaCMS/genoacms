import { defineStorageAdapter, type Secret } from '@genoacms/contracts'
import { unknownOptions, requireString, type AwsCredentials } from '../shared.js'

export interface AwsStorageOptions {
  region: string
  /** Omitted: the SDK's default credential provider chain. */
  credentials?: Secret<AwsCredentials>
}

declare module '@genoacms/contracts' {
  interface StorageAdapters { '@genoacms/adapter-aws/storage': AwsStorageOptions }
}

export default defineStorageAdapter<AwsStorageOptions>({
  runtime: '@genoacms/adapter-aws/storage/runtime',
  secretOptions: { credentials: 'json' },
  validate: options => [...unknownOptions(options, ['region', 'credentials']), ...requireString(options, 'region')]
})
