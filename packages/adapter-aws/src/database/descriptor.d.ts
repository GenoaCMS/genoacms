import type { AdapterDescriptor, Secret } from '@genoacms/contracts'
import type { AwsCredentials } from '../shared.js'

export interface AwsDatabaseOptions {
  region: string
  /** Omitted: the SDK's default credential provider chain. */
  credentials?: Secret<AwsCredentials>
}

declare module '@genoacms/contracts' {
  interface DatabaseAdapters { '@genoacms/adapter-aws/database': AwsDatabaseOptions }
}

declare const descriptor: AdapterDescriptor<'database', AwsDatabaseOptions>
export default descriptor
