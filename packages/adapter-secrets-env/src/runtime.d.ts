import type { AdapterRuntime, SecretsAdapter } from '@genoacms/contracts'
import type { EnvSecretsOptions } from './descriptor.js'

declare const runtime: AdapterRuntime<EnvSecretsOptions, SecretsAdapter>
export default runtime
