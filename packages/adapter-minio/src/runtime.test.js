import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'node:events'
import runtime from './runtime.js'

const clients = []
vi.mock('minio', () => ({
  Client: vi.fn(function (options) {
    this.options = options
    this.bucketExists = vi.fn(async () => true)
    this.putObject = vi.fn(async () => {})
    this.listObjectsV2 = vi.fn(() => {
      const stream = new EventEmitter()
      setImmediate(() => {
        stream.emit('data', { name: 'dir/a.txt', size: 3, lastModified: new Date(0) })
        stream.emit('data', { name: 'dir/.directoryPlaceholder', size: 0, lastModified: new Date(0) })
        stream.emit('data', { prefix: 'dir/sub/' })
        stream.emit('close')
      })
      return stream
    })
    clients.push(this)
  })
}))

beforeEach(() => { clients.length = 0 })

const options = { endPoint: 'localhost', port: undefined, useSSL: false, accessKey: 'a', secretKey: 's' }

describe('the MinIO runtime', () => {
  it('passes only defined options to the client', () => {
    runtime.create(options, { name: 'm', resources: [] })
    expect(clients[0].options).toEqual({ endPoint: 'localhost', useSSL: false, accessKey: 'a', secretKey: 's' })
  })

  it('builds one client per provider', () => {
    runtime.create(options, { name: 'one', resources: [] })
    runtime.create({ ...options, endPoint: 'other' }, { name: 'two', resources: [] })
    expect(clients).toHaveLength(2)
  })

  it('creates a directory as a placeholder object, as today', async () => {
    const storage = runtime.create(options, { name: 'm', resources: ['bucket'] })
    await storage.createDirectory({ bucket: 'bucket', name: 'dir' })
    expect(clients[0].putObject).toHaveBeenCalledWith('bucket', 'dir/.directoryPlaceholder', '')
  })

  it('lists a directory without its placeholder', async () => {
    const storage = runtime.create(options, { name: 'm', resources: ['bucket'] })
    expect(await storage.listDirectory({ bucket: 'bucket', name: 'dir' })).toEqual({
      files: [{ name: 'dir/a.txt', size: 3, lastModified: new Date(0) }],
      directories: [{ bucket: 'bucket', name: 'dir/sub/' }]
    })
    expect(clients[0].listObjectsV2).toHaveBeenCalledWith('bucket', 'dir/', false, undefined)
  })
})
