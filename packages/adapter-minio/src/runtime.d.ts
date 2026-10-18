import type { AdapterRuntime, StorageAdapter } from '@genoacms/contracts'
import type { MinioStorageOptions } from './descriptor.js'

declare const runtime: AdapterRuntime<MinioStorageOptions, StorageAdapter>
export default runtime
