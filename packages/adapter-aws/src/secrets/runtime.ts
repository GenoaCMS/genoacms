import { defineRuntime } from '@genoacms/contracts'
import type { Adapter } from '@genoacms/contracts/secrets'
import type { AwsSecretsOptions } from './descriptor.js'

export default defineRuntime<AwsSecretsOptions, Adapter>({
  create: () => { throw new Error('not implemented') }
})
