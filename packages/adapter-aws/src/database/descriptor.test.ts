import { describe, it, expect } from 'vitest'
import descriptor from './descriptor.js'

const validate = descriptor.validate as (options: unknown) => string[]
const REGION_REQUIRED = 'region is required and must be a non-empty string'

describe('the DynamoDB database descriptor', () => {
  it('AWS-2, DDB-1: the database descriptor names its runtime, decodes credentials as JSON and refuses unknown keys', () => {
    expect(descriptor.kind).toBe('database')
    expect(descriptor.runtime).toBe('@genoacms/adapter-aws/database/runtime')
    expect(descriptor.secretOptions).toEqual({ credentials: 'json' })
    expect(validate({ region: 'eu-central-1', bucket: 'x' })).toEqual(["unknown option 'bucket'"])
  })

  it('AWS-3, DDB-1: the database descriptor requires region', () => {
    for (const options of [{}, { region: '' }, { region: 1 }]) {
      expect(validate(options)).toEqual([REGION_REQUIRED])
    }
  })
})
