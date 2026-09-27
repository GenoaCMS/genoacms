import type { AdapterRuntime, StorageAdapter } from '@genoacms/contracts'
import type { MinioStorageOptions } from './descriptor.js'

/** Today's MinIO adapter has never implemented getPublicURL; the gap is carried, not hidden. */
declare const runtime: AdapterRuntime<MinioStorageOptions, Omit<StorageAdapter, 'getPublicURL'>>
export default runtime
