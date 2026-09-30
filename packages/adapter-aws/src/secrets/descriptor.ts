import { defineSecretsAdapter, type BootstrapSecret } from '@genoacms/contracts'
import type { AwsCredentials } from '../shared.js'

export interface AwsSecretsOptions {
  region: string
  credentials?: BootstrapSecret<AwsCredentials>
}

declare module '@genoacms/contracts' {
  interface SecretsAdapters { '@genoacms/adapter-aws/secrets': AwsSecretsOptions }
}

export default defineSecretsAdapter<AwsSecretsOptions>({
  runtime: '',
  validate: () => { throw new Error('not implemented') }
})
