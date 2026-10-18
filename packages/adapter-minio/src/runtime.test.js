import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Readable } from 'node:stream'
import * as contracts from '@genoacms/contracts/storage'
import runtime from './runtime.js'

const clients = []
vi.mock('minio', () => ({
  Client: vi.fn(function (options) {
    this.options = options
    this.bucketExists = vi.fn(async () => true)
    this.statObject = vi.fn(async () => ({ etag: 'etag-1', size: 3 }))
    this.getObject = vi.fn(async () => Readable.from([Buffer.from('abc')]))
    this.putObject = vi.fn(async () => ({ etag: 'etag-2' }))
    this.copyObject = vi.fn(async () => ({}))
    this.removeObject = vi.fn(async () => {})
    this.removeObjects = vi.fn(async () => [])
    this.presignedGetObject = vi.fn(async () => 'https://signed.example/url')
    this.listObjectsV2Query = vi.fn(async () => ({ objects: [], isTruncated: false, nextContinuationToken: '' }))
    clients.push(this)
  })
}))

beforeEach(() => { clients.length = 0 })

const options = { endPoint: 'localhost', port: undefined, useSSL: false, accessKey: 'a', secretKey: 's' }
const create = async (overrides = {}) => await runtime.create({ ...options, ...overrides }, { name: 'm', resources: ['b'] })
const ref = (name) => ({ bucket: 'b', name })
const s3Error = (code, message = code) => Object.assign(new Error(message), { code })

const sentHeaders = (call) => Object.fromEntries(Object.entries(call[4] ?? {}).map(([key, value]) => [key.toLowerCase(), value]))
const bytesOfCall = (call) => Buffer.from(call[2])
const removedName = (item) => typeof item === 'string' ? item : item.name

/** The destination and source of a copyObject call, in either of the client library's two forms. */
function copyOf (call) {
  if (typeof call[0] === 'string') return { bucket: call[0], name: call[1], source: String(call[2]) }
  const [source, destination] = call
  return { bucket: destination.Bucket, name: destination.Object, source: `${source.Bucket}/${source.Object}` }
}

const page = (objects, next) => ({ objects, isTruncated: next !== undefined, nextContinuationToken: next ?? '' })
const object = (name) => ({ name, size: 1, lastModified: new Date(0) })

describe('the MinIO runtime', () => {
  it('MIO-2: passes only defined options to the client', () => {
    runtime.create(options, { name: 'm', resources: [] })
    expect(clients[0].options).toEqual({ endPoint: 'localhost', useSSL: false, accessKey: 'a', secretKey: 's' })
  })

  it('MIO-2: builds one client per provider', () => {
    runtime.create(options, { name: 'one', resources: [] })
    runtime.create({ ...options, endPoint: 'other' }, { name: 'two', resources: [] })
    expect(clients).toHaveLength(2)
  })

  it('MIO-3, STOR-4: an unregistered bucket is refused before any client call, and bucketExists is never called', async () => {
    const storage = await create()
    const other = ref('d/n')
    other.bucket = 'other'
    const calls = {
      getObject: async () => await storage.getObject(other),
      getSignedURL: async () => await storage.getSignedURL(other, new Date(Date.now() + 60_000)),
      getPublicURL: async () => await storage.getPublicURL(other),
      uploadObject: async () => await storage.uploadObject(other, 'x', {}),
      moveObject: async () => await storage.moveObject(other, 'd/m'),
      deleteObject: async () => await storage.deleteObject(other),
      listDirectory: async () => await storage.listDirectory({ bucket: 'other', name: 'd/' }),
      createDirectory: async () => await storage.createDirectory({ bucket: 'other', name: 'd/' }),
      deleteDirectory: async () => await storage.deleteDirectory({ bucket: 'other', name: 'd/' }),
      moveDirectory: async () => await storage.moveDirectory({ bucket: 'other', name: 'd/' }, 'e/')
    }
    for (const [method, call] of Object.entries(calls)) {
      await expect(call(), method).rejects.toMatchObject({ message: 'bucket-unregistered' })
    }
    const client = clients[0]
    for (const [name, member] of Object.entries(client)) {
      if (vi.isMockFunction(member)) expect(member, name).not.toHaveBeenCalled()
    }
  })

  it('MIO-4, STOR-5: reads the ETag from statObject, then the body', async () => {
    const storage = await create()
    const client = clients[0]
    const body = Readable.from([Buffer.from('abc')])
    client.statObject.mockResolvedValueOnce({ etag: 'abc123', size: 3 })
    client.getObject.mockResolvedValueOnce(body)
    const result = await storage.getObject(ref('d/n'))
    expect(result).toEqual({ data: body, version: 'abc123' })
    expect(client.statObject).toHaveBeenCalledWith('b', 'd/n')
    expect(client.getObject).toHaveBeenCalledWith('b', 'd/n')
    expect(client.statObject.mock.invocationCallOrder[0]).toBeLessThan(client.getObject.mock.invocationCallOrder[0])
  })

  it('MIO-4, STOR-16: NoSuchKey or NotFound rejects with ObjectNotFoundError', async () => {
    const storage = await create()
    const client = clients[0]
    const missing = async () => {
      try {
        await storage.getObject(ref('d/n'))
      } catch (error) {
        return error
      }
    }
    for (const code of ['NotFound', 'NoSuchKey']) {
      client.statObject.mockRejectedValueOnce(s3Error(code))
      const fromStat = await missing()
      expect(contracts.isNotFound(fromStat), `stat ${code}`).toBe(true)
      expect(fromStat.message).toBe('storage/not-found: b/d/n')
    }
    client.getObject.mockRejectedValueOnce(s3Error('NoSuchKey'))
    const fromBody = await missing()
    expect(contracts.isNotFound(fromBody)).toBe(true)
    expect(fromBody.message).toBe('storage/not-found: b/d/n')
  })

  it('MIO-5, STOR-9: the public URL follows useSSL and the port', async () => {
    const secure = await create({ endPoint: 'h', port: 9000, useSSL: true })
    expect(await secure.getPublicURL(ref('a/b.txt'))).toBe('https://h:9000/b/a%2Fb.txt')
    const plain = await create({ endPoint: 'h', port: undefined, useSSL: false })
    expect(await plain.getPublicURL(ref('x'))).toBe('http://h/b/x')
  })

  describe('with a fixed clock', () => {
    beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2026-01-01T00:00:00Z')) })
    afterEach(() => { vi.useRealTimers() })

    it('MIO-6, STOR-9: presigns for the seconds until expires', async () => {
      const storage = await create()
      const client = clients[0]
      client.presignedGetObject.mockResolvedValueOnce('https://signed.example/u')
      const url = await storage.getSignedURL(ref('a/b.txt'), new Date(Date.now() + 90_500))
      expect(url).toBe('https://signed.example/u')
      expect(client.presignedGetObject).toHaveBeenCalledOnce()
      expect(client.presignedGetObject.mock.calls[0].slice(0, 3)).toEqual(['b', 'a/b.txt', 90])
    })
  })

  it('MIO-7, STOR-7: ifAbsent and ifVersion are sent as If-None-Match and If-Match on one PUT of known size', async () => {
    const storage = await create()
    const client = clients[0]
    const payloads = {
      string: [() => 'héllo ✓', Buffer.from('héllo ✓')],
      buffer: [() => Buffer.from([0, 1, 2, 255, 254]), Buffer.from([0, 1, 2, 255, 254])],
      stream: [() => Readable.from([Buffer.from('one '), Buffer.from('two')]), Buffer.from('one two')]
    }
    for (const [kind, [make, expected]] of Object.entries(payloads)) {
      client.putObject.mockClear()
      await storage.uploadObject(ref('d/n'), make(), { ifAbsent: true })
      await storage.uploadObject(ref('d/n'), make(), { ifVersion: 'v1' })
      expect(client.putObject, kind).toHaveBeenCalledTimes(2)
      const [absent, versioned] = client.putObject.mock.calls
      expect(absent.slice(0, 2), kind).toEqual(['b', 'd/n'])
      expect(absent[3], kind).toBe(expected.length)
      expect(bytesOfCall(absent).equals(expected), kind).toBe(true)
      expect(sentHeaders(absent)['if-none-match'], kind).toBe('*')
      expect(sentHeaders(absent)['if-match'], kind).toBeUndefined()
      expect(versioned[3], kind).toBe(expected.length)
      expect(sentHeaders(versioned)['if-match'], kind).toBe('v1')
      expect(sentHeaders(versioned)['if-none-match'], kind).toBeUndefined()
    }
    client.putObject.mockClear()
    await storage.uploadObject(ref('d/n'), 'x', { ifAbsent: true, ifVersion: 'v1' })
    expect(sentHeaders(client.putObject.mock.calls[0])['if-none-match']).toBe('*')
    expect(sentHeaders(client.putObject.mock.calls[0])['if-match']).toBeUndefined()
    const refused = async (condition, error) => {
      client.putObject.mockRejectedValueOnce(error)
      try {
        await storage.uploadObject(ref('d/n'), 'x', condition)
      } catch (caught) {
        return caught
      }
    }
    const absent = await refused({ ifAbsent: true }, s3Error('PreconditionFailed'))
    expect(contracts.isPreconditionFailed(absent)).toBe(true)
    expect(absent.message).toBe('storage/precondition-failed: b/d/n: object already exists')
    const stale = await refused({ ifVersion: 'v1' }, s3Error('PreconditionFailed'))
    expect(contracts.isPreconditionFailed(stale)).toBe(true)
    expect(stale.message).toBe('storage/precondition-failed: b/d/n: object changed since it was read')
    const gone = await refused({ ifVersion: 'v1' }, s3Error('NoSuchKey'))
    expect(contracts.isPreconditionFailed(gone)).toBe(true)
    expect(gone.reason).toBe('object changed since it was read')
  })

  it('MIO-8, STOR-10: a move copies then removes; a failed copy removes nothing', async () => {
    const storage = await create()
    const client = clients[0]
    await storage.moveObject(ref('d/old.txt'), 'd/new.txt')
    expect(client.copyObject).toHaveBeenCalledOnce()
    expect(copyOf(client.copyObject.mock.calls[0])).toEqual({ bucket: 'b', name: 'd/new.txt', source: expect.stringMatching(/^\/?b\/d\/old\.txt$/) })
    expect(client.removeObject).toHaveBeenCalledOnce()
    expect(client.removeObject).toHaveBeenCalledWith('b', 'd/old.txt')
    expect(client.copyObject.mock.invocationCallOrder[0]).toBeLessThan(client.removeObject.mock.invocationCallOrder[0])
    client.removeObject.mockClear()
    const failure = s3Error('AccessDenied')
    client.copyObject.mockRejectedValueOnce(failure)
    await expect(storage.moveObject(ref('d/old.txt'), 'd/new.txt')).rejects.toBe(failure)
    expect(client.removeObject).not.toHaveBeenCalled()
    expect(client.removeObjects).not.toHaveBeenCalled()
  })

  it('MIO-8, STOR-10, STOR-16: a delete of a missing object rejects with ObjectNotFoundError and removes nothing', async () => {
    const storage = await create()
    const client = clients[0]
    for (const code of ['NotFound', 'NoSuchKey']) {
      client.statObject.mockRejectedValueOnce(s3Error(code))
      const error = await storage.deleteObject(ref('d/n')).then(() => undefined, caught => caught)
      expect(contracts.isNotFound(error), code).toBe(true)
      expect(error.message).toBe('storage/not-found: b/d/n')
    }
    expect(client.removeObject).not.toHaveBeenCalled()
    expect(client.removeObjects).not.toHaveBeenCalled()
  })

  it('MIO-9, STOR-11: one listObjectsV2Query with the prefix as given; the old placeholder hidden; next only when truncated', async () => {
    const storage = await create()
    const client = clients[0]
    client.listObjectsV2Query.mockResolvedValueOnce({
      objects: [
        { name: 'dir/', size: 0, lastModified: new Date(0) },
        { name: 'dir/a.txt', size: 3, lastModified: new Date(5) },
        { name: 'dir/.directoryPlaceholder', size: 0, lastModified: new Date(0) },
        { prefix: 'dir/sub/', size: 0 },
        { prefix: 'dir/', size: 0 }
      ],
      isTruncated: true,
      nextContinuationToken: 't2'
    })
    const listing = await storage.listDirectory(ref('dir/'), { limit: 2, startAfter: 'dir/a', pageToken: 't1' })
    expect(client.listObjectsV2Query).toHaveBeenCalledOnce()
    expect(client.listObjectsV2Query).toHaveBeenCalledWith('b', 'dir/', 't1', '/', 2, 'dir/a')
    expect(listing).toEqual({
      files: [{ name: 'dir/a.txt', size: 3, lastModified: new Date(5) }],
      directories: [{ bucket: 'b', name: 'dir/sub/' }],
      next: 't2'
    })
    client.listObjectsV2Query.mockClear()
    client.listObjectsV2Query.mockResolvedValueOnce({ objects: [object('dir/a.txt')], isTruncated: false, nextContinuationToken: 'ignored' })
    const last = await storage.listDirectory(ref('dir/'))
    expect(client.listObjectsV2Query).toHaveBeenCalledWith('b', 'dir/', '', '/', 1000, '')
    expect(last.next).toBeUndefined()
    expect(last.files.map(file => file.name)).toEqual(['dir/a.txt'])
  })

  it('MIO-10, STOR-12: a directory is the empty object of its name', async () => {
    const storage = await create()
    const client = clients[0]
    await storage.createDirectory(ref('dir/'))
    expect(client.putObject).toHaveBeenCalledOnce()
    const call = client.putObject.mock.calls[0]
    expect(call.slice(0, 2)).toEqual(['b', 'dir/'])
    expect(Buffer.from(call[2]).length).toBe(0)
  })

  it('MIO-11, STOR-13: deletes page by page, resolves after the last removal, and rejects with the first error', async () => {
    const storage = await create()
    const client = clients[0]
    const log = []
    const releases = []
    client.listObjectsV2Query.mockImplementation(async (_bucket, _prefix, token) => {
      log.push(`list ${token === '' || token === undefined ? 'first' : token}`)
      return token === 'second' ? page([object('d/3')]) : page([object('d/1'), object('d/x/2')], 'second')
    })
    client.removeObjects.mockImplementation(async (_bucket, items) => {
      log.push(`remove ${items.map(removedName).join(',')}`)
      return await new Promise(resolve => releases.push(() => resolve([])))
    })
    let settled = false
    const deleting = storage.deleteDirectory(ref('d/')).then(() => { settled = true })
    await vi.waitFor(() => expect(releases).toHaveLength(1))
    expect(log).toEqual(['list first', 'remove d/1,d/x/2'])
    releases.shift()()
    await vi.waitFor(() => expect(releases).toHaveLength(1))
    expect(log).toEqual(['list first', 'remove d/1,d/x/2', 'list second', 'remove d/3'])
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(settled).toBe(false)
    releases.shift()()
    await deleting
    expect(settled).toBe(true)
    expect(client.listObjectsV2Query.mock.calls[0].slice(0, 2)).toEqual(['b', 'd/'])

    const removalFailure = s3Error('AccessDenied')
    client.listObjectsV2Query.mockClear()
    client.removeObjects.mockClear()
    client.removeObjects.mockRejectedValue(removalFailure)
    await expect(storage.deleteDirectory(ref('d/'))).rejects.toBe(removalFailure)
    expect(client.listObjectsV2Query).toHaveBeenCalledOnce()
    expect(client.removeObjects).toHaveBeenCalledOnce()

    const listingFailure = s3Error('SlowDown')
    client.removeObjects.mockReset()
    client.removeObjects.mockResolvedValue([])
    client.listObjectsV2Query.mockReset()
    client.listObjectsV2Query.mockRejectedValue(listingFailure)
    await expect(storage.deleteDirectory(ref('d/'))).rejects.toBe(listingFailure)
    expect(client.removeObjects).not.toHaveBeenCalled()
  })

  it('MIO-11, STOR-13: a key removeObjects reports as failed rejects with storage/delete-failed', async () => {
    const storage = await create()
    const client = clients[0]
    client.listObjectsV2Query.mockResolvedValueOnce(page([object('d/1')]))
    client.removeObjects.mockResolvedValueOnce([{ Key: 'd/1', Code: 'AccessDenied', Message: 'denied' }])
    await expect(storage.deleteDirectory(ref('d/'))).rejects.toThrow(/^storage\/delete-failed: b\/d\/1: AccessDenied$/)
  })

  it('MIO-12, STOR-14: lists first, then moves one at a time, literally, and stops at the first failure', async () => {
    const storage = await create()
    const client = clients[0]
    const log = []
    const state = { inFlight: 0, maxInFlight: 0 }
    const tracked = (event, work) => async (...args) => {
      log.push(event(args))
      state.inFlight++
      state.maxInFlight = Math.max(state.maxInFlight, state.inFlight)
      await new Promise(resolve => setTimeout(resolve, 1))
      state.inFlight--
      return await work(args)
    }
    client.listObjectsV2Query.mockImplementation(async (_bucket, _prefix, token) => {
      log.push(`list ${token === '' || token === undefined ? 'first' : token}`)
      return token === 'second' ? page([object('d/b/c')]) : page([object('d/a'), object('d/d/y')], 'second')
    })
    client.copyObject.mockImplementation(tracked(args => `copy ${copyOf(args).source} ${copyOf(args).name}`, async () => ({})))
    client.removeObject.mockImplementation(tracked(args => `remove ${args[1]}`, async () => {}))
    client.removeObjects.mockImplementation(tracked(args => `remove ${args[1].map(removedName).join(',')}`, async () => []))
    await storage.moveDirectory(ref('d/'), 'n$&/')
    const copies = client.copyObject.mock.calls.map(call => copyOf(call).name)
    expect(copies).toEqual(['n$&/a', 'n$&/d/y', 'n$&/b/c'])
    const firstCopy = log.findIndex(entry => entry.startsWith('copy'))
    expect(log.slice(0, firstCopy)).toEqual(['list first', 'list second'])
    expect(state.maxInFlight).toBe(1)
    const removed = client.removeObject.mock.calls.map(call => call[1]).concat(client.removeObjects.mock.calls.flatMap(call => call[1].map(removedName)))
    expect(removed.sort()).toEqual(['d/a', 'd/b/c', 'd/d/y'])

    client.copyObject.mockReset()
    client.removeObject.mockReset()
    client.removeObjects.mockReset()
    const failure = s3Error('AccessDenied')
    client.copyObject.mockResolvedValueOnce({}).mockRejectedValueOnce(failure).mockResolvedValue({})
    client.removeObject.mockResolvedValue(undefined)
    client.removeObjects.mockResolvedValue([])
    await expect(storage.moveDirectory(ref('d/'), 'n/')).rejects.toBe(failure)
    expect(client.copyObject).toHaveBeenCalledTimes(2)
    const removedAfterFailure = client.removeObject.mock.calls.map(call => call[1]).concat(client.removeObjects.mock.calls.flatMap(call => call[1].map(removedName)))
    expect(removedAfterFailure).toEqual(['d/a'])
  })

  it('MIO-13, STOR-15: errors propagate unchanged, and nothing is written to the console', async () => {
    const consoleMethods = ['log', 'info', 'warn', 'error', 'debug']
    const spies = consoleMethods.map(method => vi.spyOn(console, method).mockImplementation(() => {}))
    try {
      const storage = await create()
      const client = clients[0]
      const failure = s3Error('AccessDenied', 'denied')
      const rejectsWith = async (call) => {
        try {
          await call()
        } catch (error) {
          return error
        }
        return undefined
      }
      const cases = {
        getObjectStat: [() => client.statObject.mockRejectedValueOnce(failure), async () => await storage.getObject(ref('d/n'))],
        getObjectBody: [() => client.getObject.mockRejectedValueOnce(failure), async () => await storage.getObject(ref('d/n'))],
        getSignedURL: [() => client.presignedGetObject.mockRejectedValueOnce(failure), async () => await storage.getSignedURL(ref('d/n'), new Date(Date.now() + 60_000))],
        uploadObject: [() => client.putObject.mockRejectedValueOnce(failure), async () => await storage.uploadObject(ref('d/n'), 'x', {})],
        uploadObjectConditional: [() => client.putObject.mockRejectedValueOnce(failure), async () => await storage.uploadObject(ref('d/n'), 'x', { ifAbsent: true })],
        moveObject: [() => client.copyObject.mockRejectedValueOnce(failure), async () => await storage.moveObject(ref('d/n'), 'd/m')],
        deleteObject: [() => client.statObject.mockRejectedValueOnce(failure), async () => await storage.deleteObject(ref('d/n'))],
        listDirectory: [() => client.listObjectsV2Query.mockRejectedValueOnce(failure), async () => await storage.listDirectory(ref('d/'))],
        createDirectory: [() => client.putObject.mockRejectedValueOnce(failure), async () => await storage.createDirectory(ref('d/'))],
        deleteDirectoryListing: [() => client.listObjectsV2Query.mockRejectedValueOnce(failure), async () => await storage.deleteDirectory(ref('d/'))],
        deleteDirectoryRemoval: [() => {
          client.listObjectsV2Query.mockResolvedValueOnce(page([object('d/1')]))
          client.removeObjects.mockRejectedValueOnce(failure)
        }, async () => await storage.deleteDirectory(ref('d/'))],
        moveDirectoryListing: [() => client.listObjectsV2Query.mockRejectedValueOnce(failure), async () => await storage.moveDirectory(ref('d/'), 'e/')],
        moveDirectoryCopy: [() => {
          client.listObjectsV2Query.mockResolvedValueOnce(page([object('d/1')]))
          client.copyObject.mockRejectedValueOnce(failure)
        }, async () => await storage.moveDirectory(ref('d/'), 'e/')]
      }
      for (const [name, [arrange, call]] of Object.entries(cases)) {
        arrange()
        expect(await rejectsWith(call), name).toBe(failure)
      }
      for (const spy of spies) expect(spy).not.toHaveBeenCalled()
    } finally {
      for (const spy of spies) spy.mockRestore()
    }
  })

  it('STOR-2: the adapter has the ten methods, for the buckets it was given', async () => {
    const storage = await create()
    const methods = ['getObject', 'getSignedURL', 'getPublicURL', 'uploadObject', 'moveObject', 'deleteObject', 'listDirectory', 'createDirectory', 'deleteDirectory', 'moveDirectory']
    expect(Object.keys(storage).sort()).toEqual([...methods].sort())
    for (const method of methods) expect(storage[method], method).toBeTypeOf('function')
  })

  it('STOR-3: names are used as given', async () => {
    const storage = await create()
    const client = clients[0]
    const names = ['a//b', './a', 'a/../b', ' Mixed Case/ä B.TXT ']
    for (const name of names) {
      await storage.getObject(ref(name))
      await storage.uploadObject(ref(name), 'x', { ifAbsent: true })
      await storage.deleteObject(ref(name))
    }
    expect(client.statObject.mock.calls.map(call => call[1])).toEqual(names.flatMap(name => [name, name]))
    expect(client.getObject.mock.calls.map(call => call[1])).toEqual(names)
    expect(client.putObject.mock.calls.map(call => call[1])).toEqual(names)
    expect(client.removeObject.mock.calls.map(call => call[1])).toEqual(names)
    await storage.listDirectory(ref('a//'))
    await storage.listDirectory(ref('a/../'))
    expect(client.listObjectsV2Query.mock.calls.map(call => call[1])).toEqual(['a//', 'a/../'])
  })

  it('STOR-7: a write resolves to undefined, whatever its condition', async () => {
    const storage = await create()
    expect(await storage.uploadObject(ref('n'), 'x', {})).toBeUndefined()
    expect(await storage.uploadObject(ref('n'), 'x', { ifAbsent: true })).toBeUndefined()
    expect(await storage.uploadObject(ref('n'), 'x', { ifVersion: 'v' })).toBeUndefined()
  })

  it('STOR-9: neither URL asks the server whether the object exists', async () => {
    const storage = await create()
    const client = clients[0]
    await storage.getPublicURL(ref('never-written'))
    await storage.getSignedURL(ref('never-written'), new Date(Date.now() + 60_000))
    expect(client.statObject).not.toHaveBeenCalled()
    expect(client.getObject).not.toHaveBeenCalled()
  })

  it('STOR-10: a move and a delete resolve to undefined', async () => {
    const storage = await create()
    expect(await storage.moveObject(ref('n'), 'm')).toBeUndefined()
    expect(await storage.deleteObject(ref('n'))).toBeUndefined()
  })
})
