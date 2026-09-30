import { describe, it, expect } from 'vitest'
import descriptor from './descriptor.js'

const validate = descriptor.validate as (options: unknown) => string[]
const REGION_REQUIRED = 'region is required and must be a non-empty string'

describe('the Secrets Manager secrets descriptor', () => {
  it('AWS-2, ASM-1: the secrets descriptor names its runtime, decodes credentials as JSON and refuses unknown keys', () => {
    expect(descriptor.kind).toBe('secrets')
    expect(descriptor.runtime).toBe('@genoacms/adapter-aws/secrets/runtime')
    expect(descriptor.secretOptions).toEqual({ credentials: 'json' })
    expect(validate({ region: 'eu-central-1', bucket: 'x' })).toEqual(["unknown option 'bucket'"])
  })

  it('AWS-3, ASM-1: the secrets descriptor requires region', () => {
    for (const options of [{}, { region: '' }, { region: 1 }]) {
      expect(validate(options)).toEqual([REGION_REQUIRED])
    }
  })

  it('AWS-2: gives one reason per unknown key', () => {
    const reasons = validate({ region: 'eu-central-1', zeta: 1, alpha: 2 })
    expect([...reasons].sort()).toEqual(["unknown option 'alpha'", "unknown option 'zeta'"])
  })
})
