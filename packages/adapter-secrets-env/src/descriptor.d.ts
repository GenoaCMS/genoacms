import type { AdapterDescriptor } from '@genoacms/contracts'

export interface EnvSecretsOptions {
  /** Relative to the project root. Default `.genoacms/secrets.env`, which Vite does not watch. */
  path?: string
}

declare module '@genoacms/contracts' {
  interface SecretsAdapters { '@genoacms/adapter-secrets-env': EnvSecretsOptions }
}

declare const descriptor: AdapterDescriptor<'secrets', EnvSecretsOptions>
export default descriptor
