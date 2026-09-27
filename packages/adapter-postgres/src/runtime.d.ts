import type { AdapterRuntime, DatabaseAdapter } from '@genoacms/contracts'
import type { PostgresDatabaseOptions } from './descriptor.js'

declare const runtime: AdapterRuntime<PostgresDatabaseOptions, DatabaseAdapter>
export default runtime
