import type { AdapterDescriptor, Secret } from '@genoacms/contracts'
import type { AwsCredentials } from '../shared.js'

export interface AwsStorageOptions {
  region: string
  /** Omitted: the SDK's default credential provider chain. */
  credentials?: Secret<AwsCredentials>
}

declare module '@genoacms/contracts' {
  interface StorageAdapters { '@genoacms/adapter-aws/storage': AwsStorageOptions }
}

declare const descriptor: AdapterDescriptor<'storage', AwsStorageOptions>
export default descriptor
