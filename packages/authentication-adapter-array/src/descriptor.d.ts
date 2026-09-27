import type { AdapterDescriptor, Secret } from '@genoacms/contracts'
import type { Credentials } from './config.js'

export interface ArrayAuthenticationOptions {
  /** A JSON array of { subject, email, password }. */
  credentials: Secret<Credentials[]>
}

declare module '@genoacms/contracts' {
  interface AuthenticationAdapters { '@genoacms/authentication-adapter-array': ArrayAuthenticationOptions }
}

declare const descriptor: AdapterDescriptor<'authentication', ArrayAuthenticationOptions>
export default descriptor
