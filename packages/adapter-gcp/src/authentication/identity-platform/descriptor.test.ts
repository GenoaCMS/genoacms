import { describe, it, expect } from 'vitest'
import descriptor from './descriptor.js'

describe('the GCP Identity Platform descriptor', () => {
  it('AUTH-1: names its runtime, decodes the API key as a string and credentials as JSON', () => {
    expect(descriptor.kind).toBe('authentication')
    expect(descriptor.runtime).toBe('@genoacms/adapter-gcp/authentication/identity-platform/runtime')
    expect(descriptor.secretOptions).toEqual({ apiKey: 'string', credentials: 'json' })
    expect(descriptor.developmentOnly).toBeUndefined()
  })

  it('AUTH-1, COM-2, COM-3: accepts a project and an optional tenant, and refuses unknown keys, a missing project and an empty tenant', () => {
    const validate = descriptor.validate as (options: unknown) => string[]
    expect(validate({ projectId: 'p' })).toEqual([])
    expect(validate({ projectId: 'p', tenantId: 't', apiKey: { $secret: 'K' }, credentials: { $env: 'C' } })).toEqual([])
    expect(validate({ projectId: 'p', extra: 1 })).toEqual(["unknown option 'extra'"])
    expect(validate({})).toEqual(['projectId is required and must be a non-empty string'])
    expect(validate({ projectId: 'p', tenantId: '' })).toEqual(['tenantId must be a non-empty string'])
    expect(validate({ projectId: 'p', tenantId: 7 })).toEqual(['tenantId must be a non-empty string'])
  })
})
