import type { AdapterRuntime, AuthenticationAdapter } from '@genoacms/contracts'
import type { ArrayAuthenticationOptions } from './descriptor.js'

declare const runtime: AdapterRuntime<ArrayAuthenticationOptions, AuthenticationAdapter>
export default runtime
