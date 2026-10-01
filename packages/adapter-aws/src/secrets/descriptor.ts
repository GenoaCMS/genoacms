import { defineSecretsAdapter, type BootstrapSecret } from '@genoacms/contracts'
import { unknownOptions, requireString, type AwsCredentials } from '../shared.js'

export interface AwsSecretsOptions {
  region: string
  /** Bootstrap: env() or inline() only. Omitted: the SDK's default credential provider chain. */
  credentials?: BootstrapSecret<AwsCredentials>
}

declare module '@genoacms/contracts' {
  interface SecretsAdapters { '@genoacms/adapter-aws/secrets': AwsSecretsOptions }
}

export default defineSecretsAdapter<AwsSecretsOptions>({
  runtime: '@genoacms/adapter-aws/secrets/runtime',
  secretOptions: { credentials: 'json' },
  validate: options => [...unknownOptions(options, ['region', 'credentials']), ...requireString(options, 'region')]
})
