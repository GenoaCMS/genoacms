import { describe, it, expect } from 'vitest'
import descriptor from './descriptor.js'

describe('the GCP storage descriptor', () => {
  it('names its runtime and decodes credentials as JSON', () => {
    expect(descriptor.kind).toBe('storage')
    expect(descriptor.runtime).toBe('@genoacms/adapter-gcp/storage/runtime')
    expect(descriptor.secretOptions).toEqual({ credentials: 'json' })
  })

  it('accepts a project id and refuses unknown keys, a missing project id and an empty one', () => {
    const validate = descriptor.validate as (options: unknown) => string[]
    expect(validate({ projectId: 'p' })).toEqual([])
    expect(validate({ projectId: 'p', region: 'x' })).toEqual(["unknown option 'region'"])
    expect(validate({})).toHaveLength(1)
    expect(validate({ projectId: '' })).toHaveLength(1)
  })
})
