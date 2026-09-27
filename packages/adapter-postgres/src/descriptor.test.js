import { describe, it, expect } from 'vitest'
import descriptor from './descriptor.js'

const valid = { host: 'localhost', port: 5432, database: 'genoacms', user: 'genoacms', password: { $env: 'PGPASSWORD' } }

describe('the Postgres descriptor', () => {
  it('names its runtime and its string password', () => {
    expect(descriptor.kind).toBe('database')
    expect(descriptor.runtime).toBe('@genoacms/adapter-postgres/runtime')
    expect(descriptor.secretOptions).toEqual({ password: 'string' })
  })

  it('accepts flattened connection options', () => {
    expect(descriptor.validate(valid)).toEqual([])
  })

  it.each([
    ["the old 'username' key", { ...valid, username: 'genoacms' }],
    ['a missing host', { ...valid, host: undefined }],
    ['an empty database', { ...valid, database: '' }],
    ['a missing user', { ...valid, user: undefined }],
    ['a missing password', { ...valid, password: undefined }],
    ['a non-integer port', { ...valid, port: '5432' }]
  ])('refuses %s', (_case, options) => {
    expect(descriptor.validate(options)).toHaveLength(1)
  })
})
