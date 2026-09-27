import { defineSecretsAdapter, type BootstrapSecret } from '@genoacms/contracts'
import { unknownOptions, requireString, type ServiceAccount } from '../shared/serviceAccount.js'

export interface GcpSecretsOptions {
  projectId: string
  /** Bootstrap: env() or inline() only. Omit for Application Default Credentials (recommended). */
  credentials?: BootstrapSecret<ServiceAccount>
}

declare module '@genoacms/contracts' {
  interface SecretsAdapters { '@genoacms/adapter-gcp/secrets': GcpSecretsOptions }
}

export default defineSecretsAdapter<GcpSecretsOptions>({
  runtime: '@genoacms/adapter-gcp/secrets/runtime',
  secretOptions: { credentials: 'json' },
  validate: options => [...unknownOptions(options, ['projectId', 'credentials']), ...requireString(options, 'projectId')]
})
