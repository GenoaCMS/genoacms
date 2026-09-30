import { describe, it, expect, vi, beforeEach } from 'vitest'
import runtime from './runtime.js'

const clients = []
vi.mock('@aws-sdk/client-s3', () => {
  const command = (type) => vi.fn(function (input) { this.type = type; this.input = input })
  return {
    S3Client: vi.fn(function (config) { this.config = config; this.send = vi.fn(async () => ({ Body: 'body', ETag: '"e1"' })); clients.push(this) }),
    GetObjectCommand: command('GetObject'),
    PutObjectCommand: command('PutObject'),
    DeleteObjectCommand: command('DeleteObject'),
    ListObjectsV2Command: command('ListObjectsV2')
  }
})
vi.mock('@aws-sdk/lib-storage', () => ({ Upload: vi.fn() }))
vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: vi.fn() }))

beforeEach(() => { clients.length = 0 })

describe('the S3 runtime', () => {
  it('passes credentials only when given', () => {
    runtime.create({ region: 'eu' }, { name: 'a', resources: [] })
    runtime.create({ region: 'eu', credentials: { accessKeyId: 'k', secretAccessKey: 's' } }, { name: 'b', resources: [] })
    expect(clients.map(c => c.config)).toEqual([{ region: 'eu' }, { region: 'eu', credentials: { accessKeyId: 'k', secretAccessKey: 's' } }])
  })

  it('refuses a bucket outside its resources and reads a registered one with its etag', async () => {
    const storage = runtime.create({ region: 'eu' }, { name: 'a', resources: ['content'] })
    await expect(storage.getObject({ bucket: 'other', name: 'n' })).rejects.toThrow('bucket-unregistered')
    expect(await storage.getObject({ bucket: 'content', name: 'n' })).toEqual({ data: 'body', version: '"e1"' })
  })

  it("builds public URLs from its own region", () => {
    const storage = runtime.create({ region: 'eu-central-1' }, { name: 'a', resources: ['b'] })
    expect(storage.getPublicURL({ bucket: 'b', name: 'n' })).toBe('https://b.s3.eu-central-1.amazonaws.com/n')
  })

  it('keeps two providers in different regions apart', () => {
    const eu = runtime.create({ region: 'eu-central-1' }, { name: 'eu', resources: ['b'] })
    const us = runtime.create({ region: 'us-east-1' }, { name: 'us', resources: ['b'] })
    expect(clients).toHaveLength(2)
    expect(us.getPublicURL({ bucket: 'b', name: 'n' })).not.toBe(eu.getPublicURL({ bucket: 'b', name: 'n' }))
  })
})
