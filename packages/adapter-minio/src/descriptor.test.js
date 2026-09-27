import { describe, it, expect } from 'vitest'
import descriptor from './descriptor.js'

const valid = { endPoint: 'localhost', port: 9000, useSSL: false, accessKey: { $env: 'A' }, secretKey: { $env: 'S' } }

describe('the MinIO descriptor', () => {
  it('names its runtime and its two string credentials', () => {
    expect(descriptor.kind).toBe('storage')
    expect(descriptor.runtime).toBe('@genoacms/adapter-minio/runtime')
    expect(descriptor.secretOptions).toEqual({ accessKey: 'string', secretKey: 'string' })
  })

  it('accepts flattened client options', () => {
    expect(descriptor.validate(valid)).toEqual([])
  })

  it.each([
    ['an unknown key', { ...valid, config: {} }],
    ['a missing endPoint', { ...valid, endPoint: undefined }],
    ['a port out of range', { ...valid, port: 70000 }],
    ['a non-boolean useSSL', { ...valid, useSSL: 'yes' }],
    ['a missing accessKey', { ...valid, accessKey: undefined }],
    ['a missing secretKey', { ...valid, secretKey: undefined }]
  ])('refuses %s', (_case, options) => {
    expect(descriptor.validate(options)).toHaveLength(1)
  })
})
