import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import descriptor from './descriptor.js'

const valid = { endPoint: 'localhost', port: 9000, useSSL: false, accessKey: { $env: 'A' }, secretKey: { $env: 'S' } }
const messages = (options) => descriptor.validate(options)

describe('the MinIO descriptor', () => {
  it('MIO-1: names its runtime and its two string credentials', () => {
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    expect(manifest.name).toBe('@genoacms/adapter-minio')
    expect(descriptor.kind).toBe('storage')
    expect(descriptor.runtime).toBe('@genoacms/adapter-minio/runtime')
    expect(descriptor.secretOptions).toEqual({ accessKey: 'string', secretKey: 'string' })
  })

  it('MIO-1: accepts flattened client options', () => {
    expect(descriptor.validate(valid)).toEqual([])
  })

  it('MIO-1: accepts the optional options, and the ends of the port range', () => {
    expect(messages({ ...valid, region: 'eu-central-1' })).toEqual([])
    expect(messages({ ...valid, port: 1 })).toEqual([])
    expect(messages({ ...valid, port: 65535 })).toEqual([])
    expect(messages({ endPoint: 'h', accessKey: valid.accessKey, secretKey: valid.secretKey })).toEqual([])
  })

  it.each([
    ['an unknown key', { ...valid, config: {} }],
    ['a missing endPoint', { ...valid, endPoint: undefined }],
    ['an empty endPoint', { ...valid, endPoint: '' }],
    ['an endPoint that is not a string', { ...valid, endPoint: 5 }],
    ['a port out of range', { ...valid, port: 70000 }],
    ['a port of zero', { ...valid, port: 0 }],
    ['a port that is not an integer', { ...valid, port: 9000.5 }],
    ['a non-boolean useSSL', { ...valid, useSSL: 'yes' }],
    ['a missing accessKey', { ...valid, accessKey: undefined }],
    ['a missing secretKey', { ...valid, secretKey: undefined }]
  ])('MIO-1: refuses %s', (_case, options) => {
    expect(descriptor.validate(options)).toHaveLength(1)
  })

  it("MIO-1: names an unknown option as unknown option '<key>'", () => {
    expect(messages({ ...valid, config: {} })).toEqual(["unknown option 'config'"])
    expect(messages({ ...valid, region: 'r', extra: 1 })).toEqual(["unknown option 'extra'"])
  })
})
