import { describe, it, expect } from 'vitest'
import descriptor from './descriptor.js'

describe('the GCP database descriptor', () => {
  it('DB-1: names its runtime and decodes credentials as JSON', () => {
    expect(descriptor.kind).toBe('database')
    expect(descriptor.runtime).toBe('@genoacms/adapter-gcp/database/runtime')
    expect(descriptor.secretOptions).toEqual({ credentials: 'json' })
  })

  it('COM-2, COM-3, DB-1: accepts a project and database id, and refuses region, a missing project id and an empty one', () => {
    const validate = descriptor.validate as (options: unknown) => string[]
    expect(validate({ projectId: 'p', databaseId: '(default)' })).toEqual([])
    expect(validate({ projectId: 'p', region: 'eu-west3' })).toEqual(["unknown option 'region'"])
    expect(validate({})).toHaveLength(1)
    expect(validate({ projectId: '' })).toHaveLength(1)
  })
})
