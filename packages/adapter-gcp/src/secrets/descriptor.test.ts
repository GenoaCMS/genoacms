import { describe, it, expect } from 'vitest'
import descriptor from './descriptor.js'

describe('the GCP secrets descriptor', () => {
  it('SEC-1: names its runtime and decodes credentials as JSON', () => {
    expect(descriptor.kind).toBe('secrets')
    expect(descriptor.runtime).toBe('@genoacms/adapter-gcp/secrets/runtime')
    expect(descriptor.secretOptions).toEqual({ credentials: 'json' })
    expect(descriptor.developmentOnly).toBeUndefined()
  })

  it('COM-2, COM-3, SEC-1: accepts a project id and refuses unknown keys, a missing project id and an empty one', () => {
    const validate = descriptor.validate as (options: unknown) => string[]
    expect(validate({ projectId: 'p' })).toEqual([])
    expect(validate({ projectId: 'p', extra: 1 })).toEqual(["unknown option 'extra'"])
    expect(validate({})).toHaveLength(1)
    expect(validate({})).toEqual(['projectId is required and must be a non-empty string'])
    expect(validate({ projectId: '' })).toHaveLength(1)
  })
})
