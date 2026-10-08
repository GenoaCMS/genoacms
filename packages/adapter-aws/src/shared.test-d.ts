import { describe, it, expectTypeOf } from 'vitest'
import type { AwsCredentials } from './shared.js'

describe('AwsCredentials', () => {
  it('AWS-1: is the SDK\'s static credentials', () => {
    expectTypeOf<AwsCredentials>().toEqualTypeOf<{ accessKeyId: string, secretAccessKey: string, sessionToken?: string }>()
  })
})
