import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Readable } from 'node:stream'
import * as contracts from '@genoacms/contracts/storage'
import { PreconditionFailedError } from '@genoacms/contracts/storage'
import runtime from './runtime.js'

interface MockFile {
  name: string
  metadata: Record<string, unknown>
  getMetadata: ReturnType<typeof vi.fn>
  createReadStream: ReturnType<typeof vi.fn>
  save: ReturnType<typeof vi.fn>
  move: ReturnType<typeof vi.fn>
  delete: ReturnType<typeof vi.fn>
}

function mockFileResolvingEveryCall (name: string, metadata: Record<string, unknown> = {}): MockFile {
  return {
    name,
    metadata,
    getMetadata: vi.fn(async () => [{ generation: 7 }]),
    createReadStream: vi.fn(() => 'stream'),
    save: vi.fn(async () => {}),
    move: vi.fn(async () => {}),
    delete: vi.fn(async () => {})
  }
}

const files = new Map<string, MockFile>()
const fileNamed = (name: string): MockFile => {
  if (!files.has(name)) files.set(name, mockFileResolvingEveryCall(name))
  return files.get(name) as MockFile
}
const bucket = { file: vi.fn(fileNamed), getFiles: vi.fn() }
const instances: Array<{ options: unknown, bucket: ReturnType<typeof vi.fn> }> = []
vi.mock('@google-cloud/storage', () => ({
  Storage: vi.fn(function (this: any, options: unknown) {
    this.options = options
    this.bucket = vi.fn(() => bucket)
    instances.push(this)
  })
}))

beforeEach(() => {
  instances.length = 0
  files.clear()
  bucket.getFiles.mockReset()
})

const create = async () => await runtime.create({ projectId: 'p' }, { name: 'a', resources: ['b'] })
const stream = () => Readable.from(['x'])
const settleTasks = async (): Promise<void> => { for (let tick = 0; tick < 5; tick++) await new Promise(resolve => setTimeout(resolve, 0)) }

interface PendingDelete { name: string, resolve: () => void, reject: (error: unknown) => void }

function deletesThatWaitForRelease () {
  const pending: PendingDelete[] = []
  const log: string[] = []
  const state = { inFlight: 0, maxInFlight: 0, started: 0 }
  const end = (name: string) => { state.inFlight--; log.push(`end ${name}`) }
  const file = (name: string): MockFile => {
    const mock = mockFileResolvingEveryCall(name)
    mock.delete.mockImplementation(async () => await new Promise((resolve, reject) => {
      state.started++
      state.inFlight++
      state.maxInFlight = Math.max(state.maxInFlight, state.inFlight)
      log.push(`start ${name}`)
      pending.push({
        name,
        resolve: () => { end(name); resolve([{}]) },
        reject: (error: unknown) => { end(name); reject(error) }
      })
    }))
    return mock
  }
  const releaseOldest = (): void => { pending.shift()?.resolve() }
  return { pending, log, state, file, releaseOldest }
}

function settlement (operation: Promise<unknown>) {
  const outcome: { settled: boolean, error?: unknown } = { settled: false }
  operation.then(() => { outcome.settled = true }, (error: unknown) => { outcome.settled = true; outcome.error = error })
  return outcome
}

function bucketHolding (names: string[]) {
  const stored = new Map<string, MockFile>()
  const moves: string[] = []
  const add = (name: string): MockFile => {
    const mock = mockFileResolvingEveryCall(name)
    mock.move.mockImplementation(async (newName: string) => {
      moves.push(newName)
      stored.delete(name)
      stored.set(newName, add(newName))
    })
    return mock
  }
  for (const name of names) stored.set(name, add(name))
  bucket.getFiles.mockImplementation(async (query: { prefix?: string }) => {
    const listed = [...stored.keys()].filter(name => name.startsWith(query.prefix ?? '')).sort()
    return [listed.map(name => stored.get(name) as MockFile), null, {}]
  })
  return { moves }
}

describe('the GCP storage runtime', () => {
  it('COM-4, STO-2: passes the project, and the credentials only when given', async () => {
    await runtime.create({ projectId: 'p' }, { name: 'a', resources: [] })
    await runtime.create({ projectId: 'p', credentials: { client_email: 'e' } as any }, { name: 'b', resources: [] })
    expect(instances.map(i => i.options)).toEqual([{ projectId: 'p' }, { projectId: 'p', credentials: { client_email: 'e' } }])
  })

  it('COM-4: builds one client per provider: two providers on this adapter share nothing', async () => {
    const a = await runtime.create({ projectId: 'one' }, { name: 'a', resources: ['x'] })
    const b = await runtime.create({ projectId: 'two' }, { name: 'b', resources: ['y'] })
    expect(instances).toHaveLength(2)
    expect(a).not.toBe(b)
  })

  it('STO-3, STO-4, STOR-4, STOR-5: refuses a bucket outside its resources, and reads a registered one with its generation', async () => {
    const storage = await runtime.create({ projectId: 'p' }, { name: 'a', resources: ['registered'] })
    await expect(storage.getObject({ bucket: 'other', name: 'n' })).rejects.toThrow('bucket-unregistered')
    expect(await storage.getObject({ bucket: 'registered', name: 'n' })).toEqual({ data: 'stream', version: '7' })
  })

  it('STO-4, STOR-5: another metadata failure reads without a version', async () => {
    const storage = await create()
    fileNamed('n').getMetadata.mockRejectedValueOnce(new Error('forbidden'))
    expect(await storage.getObject({ bucket: 'b', name: 'n' })).toEqual({ data: 'stream', version: undefined })
  })

  it('STO-6, STOR-7: creates atomically with ifAbsent', async () => {
    const storage = await create()
    const data = stream()
    await storage.uploadObject({ bucket: 'b', name: 'n' }, data, { ifAbsent: true })
    expect(fileNamed('n').save).toHaveBeenCalledWith(data, { preconditionOpts: { ifGenerationMatch: 0 } })
  })

  it('STO-6, STOR-7: writes conditionally on ifVersion', async () => {
    const storage = await create()
    const data = stream()
    await storage.uploadObject({ bucket: 'b', name: 'n' }, data, { ifVersion: '5' })
    expect(fileNamed('n').save).toHaveBeenCalledWith(data, { preconditionOpts: { ifGenerationMatch: 5 } })
  })

  it('STO-6, STOR-7: writes unconditionally without a condition', async () => {
    const storage = await create()
    const data = stream()
    await storage.uploadObject({ bucket: 'b', name: 'n' }, data)
    expect(fileNamed('n').save).toHaveBeenCalledWith(data, {})
  })

  it('STO-6, STOR-7: maps a failed precondition to PreconditionFailedError', async () => {
    const storage = await create()
    const failWith = (code: number) => fileNamed('n').save.mockRejectedValueOnce(Object.assign(new Error(`http ${code}`), { code }))
    failWith(412)
    const absent = storage.uploadObject({ bucket: 'b', name: 'n' }, stream(), { ifAbsent: true })
    await expect(absent).rejects.toBeInstanceOf(PreconditionFailedError)
    failWith(412)
    await expect(storage.uploadObject({ bucket: 'b', name: 'n' }, stream(), { ifAbsent: true }))
      .rejects.toThrow('storage/precondition-failed: b/n: object already exists')
    failWith(412)
    await expect(storage.uploadObject({ bucket: 'b', name: 'n' }, stream(), { ifVersion: '5' }))
      .rejects.toThrow('storage/precondition-failed: b/n: object changed since it was read')
    failWith(500)
    await expect(storage.uploadObject({ bucket: 'b', name: 'n' }, stream())).rejects.toThrow('http 500')
  })

  it('STO-7, STOR-10: moves and deletes a single object', async () => {
    const storage = await create()
    await storage.moveObject({ bucket: 'b', name: 'n' }, 'new')
    await storage.deleteObject({ bucket: 'b', name: 'n' })
    expect(fileNamed('n').move).toHaveBeenCalledWith('new')
    expect(fileNamed('n').delete).toHaveBeenCalled()
  })

  it('STO-9, STOR-11: lists one level, hiding placeholders and the directory itself', async () => {
    const storage = await create()
    bucket.getFiles.mockResolvedValueOnce([[
      mockFileResolvingEveryCall('d/', { size: '0' }),
      mockFileResolvingEveryCall('d/.folderPlaceholder', { size: '0' }),
      mockFileResolvingEveryCall('d/x', { size: '12', updated: '2026-01-01T00:00:00Z' }),
      mockFileResolvingEveryCall('d/y', { updated: '2026-01-02T00:00:00Z' })
    ], {}, { prefixes: ['d/', 'd/sub/'] }])
    const listing = await storage.listDirectory({ bucket: 'b', name: 'd/' }, { limit: 10, startAfter: 'd/a' })
    expect(bucket.getFiles).toHaveBeenCalledWith({ autoPaginate: false, prefix: 'd/', maxResults: 10, startOffset: 'd/a', delimiter: '/' })
    expect(listing).toEqual({
      files: [
        { name: 'd/x', size: 12, lastModified: new Date('2026-01-01T00:00:00Z') },
        { name: 'd/y', size: 0, lastModified: new Date('2026-01-02T00:00:00Z') }
      ],
      directories: [{ bucket: 'b', name: 'd/sub/' }]
    })
  })

  it('STO-12, STOR-14: moves every object under a directory, replacing the first occurrence', async () => {
    const storage = await create()
    const listed = [mockFileResolvingEveryCall('d/x'), mockFileResolvingEveryCall('d/e/d/y')]
    bucket.getFiles.mockResolvedValueOnce([listed])
    await storage.moveDirectory({ bucket: 'b', name: 'd/' }, 'n/')
    expect(listed[0].move).toHaveBeenCalledWith('n/x')
    expect(listed[1].move).toHaveBeenCalledWith('n/e/d/y')
  })

  it('STO-9, STOR-11: does not list the object or prefix named startAfter', async () => {
    const storage = await create()
    const page = () => [[mockFileResolvingEveryCall('p/2'), mockFileResolvingEveryCall('p/3')], {}, { prefixes: ['p/2/', 'p/4/'] }]
    const names = (listing: { files: Array<{ name: string }>, directories: Array<{ name: string }> }) =>
      ({ files: listing.files.map(file => file.name), directories: listing.directories.map(directory => directory.name) })
    bucket.getFiles.mockResolvedValueOnce(page())
    expect(names(await storage.listDirectory({ bucket: 'b', name: 'p/' }, { limit: 10, startAfter: 'p/2' })))
      .toEqual({ files: ['p/3'], directories: ['p/2/', 'p/4/'] })
    expect(bucket.getFiles).toHaveBeenLastCalledWith(expect.objectContaining({ startOffset: 'p/2' }))
    bucket.getFiles.mockResolvedValueOnce(page())
    expect(names(await storage.listDirectory({ bucket: 'b', name: 'p/' }, { limit: 10, startAfter: 'p/2/' })))
      .toEqual({ files: ['p/2', 'p/3'], directories: ['p/4/'] })
    expect(bucket.getFiles).toHaveBeenLastCalledWith(expect.objectContaining({ startOffset: 'p/2/' }))
  })

  it('STO-9, STOR-11: hides only names that end in .folderPlaceholder', async () => {
    const storage = await create()
    bucket.getFiles.mockResolvedValueOnce([[
      mockFileResolvingEveryCall('d/a.folderPlaceholder.txt'),
      mockFileResolvingEveryCall('d/.folderPlaceholder')
    ], {}, { prefixes: [] }])
    const listing = await storage.listDirectory({ bucket: 'b', name: 'd/' })
    expect(listing.files.map(file => file.name)).toEqual(['d/a.folderPlaceholder.txt'])
  })

  it('STO-11, STOR-13: lists page by page and deletes at most 10 at a time', async () => {
    const storage = await create()
    const deletes = deletesThatWaitForRelease()
    const firstPage = Array.from({ length: 15 }, (_, index) => deletes.file(`d/one/${index}`))
    const secondPage = Array.from({ length: 3 }, (_, index) => deletes.file(`d/two/${index}`))
    const nextQuery = { prefix: 'd/', autoPaginate: false, pageToken: 'second' }
    bucket.getFiles.mockImplementation(async (query: { pageToken?: string }) => {
      deletes.log.push(`list ${query.pageToken ?? 'first'}`)
      return query.pageToken === 'second' ? [secondPage, null, {}] : [firstPage, nextQuery, {}]
    })
    const outcome = settlement(storage.deleteDirectory({ bucket: 'b', name: 'd/' }))
    for (let round = 0; round < 100 && !outcome.settled; round++) {
      await settleTasks()
      deletes.releaseOldest()
    }
    expect(outcome).toEqual({ settled: true })
    expect(bucket.getFiles.mock.calls).toEqual([[{ prefix: 'd/', autoPaginate: false }], [nextQuery]])
    expect(deletes.state.maxInFlight).toBeLessThanOrEqual(10)
    const secondListing = deletes.log.indexOf('list second')
    const lastFirstPageEnd = Math.max(...firstPage.map(file => deletes.log.indexOf(`end ${file.name}`)))
    expect(lastFirstPageEnd).toBeGreaterThanOrEqual(0)
    expect(secondListing).toBeGreaterThan(lastFirstPageEnd)
    for (const file of [...firstPage, ...secondPage]) expect(file.delete).toHaveBeenCalledOnce()
  })

  it('STO-11, STOR-13: starts no delete after the first failure, and rejects with it once the started ones end', async () => {
    const storage = await create()
    const deletes = deletesThatWaitForRelease()
    const page = Array.from({ length: 30 }, (_, index) => deletes.file(`d/${String(index).padStart(2, '0')}`))
    bucket.getFiles.mockImplementation(async () => [page, { prefix: 'd/', autoPaginate: false, pageToken: 'next' }, {}])
    const failure = Object.assign(new Error('forbidden'), { code: 403 })
    const outcome = settlement(storage.deleteDirectory({ bucket: 'b', name: 'd/' }))
    for (let round = 0; round < 100 && deletes.state.started < 3; round++) {
      await settleTasks()
      if (deletes.state.started < 3) deletes.releaseOldest()
    }
    const third = deletes.pending.find(entry => entry.name === deletes.log.filter(line => line.startsWith('start '))[2].slice('start '.length))
    deletes.pending.splice(deletes.pending.indexOf(third as PendingDelete), 1)
    ;(third as PendingDelete).reject(failure)
    const startedBeforeFailure = deletes.state.started
    await settleTasks()
    while (deletes.pending.length > 0) {
      expect(outcome.settled).toBe(false)
      deletes.releaseOldest()
      await settleTasks()
    }
    expect(deletes.state.started).toBe(startedBeforeFailure)
    expect(deletes.state.started).toBeLessThan(30)
    expect(outcome).toEqual({ settled: true, error: failure })
    expect(outcome.error).toBe(failure)
    expect(bucket.getFiles).toHaveBeenCalledOnce()
  })

  it('STO-11, STOR-13: rejects with a listing error', async () => {
    const storage = await create()
    const failure = Object.assign(new Error('forbidden'), { code: 403 })
    bucket.getFiles.mockRejectedValueOnce(failure)
    await expect(storage.deleteDirectory({ bucket: 'b', name: 'd/' })).rejects.toBe(failure)
    expect([...files.values()].every(file => file.delete.mock.calls.length === 0)).toBe(true)
  })

  it('STO-11, STOR-13: rejects with the first failed delete\'s error, not a later one', async () => {
    const storage = await create()
    const deletes = deletesThatWaitForRelease()
    const page = [deletes.file('d/1'), deletes.file('d/2')]
    bucket.getFiles.mockImplementation(async () => [page, null, {}])
    const first = new Error('first')
    const second = new Error('second')
    const outcome = settlement(storage.deleteDirectory({ bucket: 'b', name: 'd/' }))
    await settleTasks()
    deletes.pending.shift()?.reject(first)
    await settleTasks()
    deletes.pending.shift()?.reject(second)
    await settleTasks()
    expect(outcome.error).toBe(first)
  })

  it('STO-11, STOR-13: rejects with a later page\'s listing error', async () => {
    const storage = await create()
    const failure = Object.assign(new Error('unavailable'), { code: 503 })
    bucket.getFiles
      .mockResolvedValueOnce([[mockFileResolvingEveryCall('d/1')], { prefix: 'd/', autoPaginate: false, pageToken: 'second' }, {}])
      .mockRejectedValueOnce(failure)
    await expect(storage.deleteDirectory({ bucket: 'b', name: 'd/' })).rejects.toBe(failure)
  })

  it('STO-11, STOR-13: lists a short page\'s successor only after its deletes end', async () => {
    const storage = await create()
    const deletes = deletesThatWaitForRelease()
    const firstPage = Array.from({ length: 3 }, (_, index) => deletes.file(`d/one/${index}`))
    const secondPage = Array.from({ length: 10 }, (_, index) => deletes.file(`d/two/${index}`))
    bucket.getFiles.mockImplementation(async (query: { pageToken?: string }) => {
      deletes.log.push(`list ${query.pageToken ?? 'first'}`)
      return query.pageToken === 'second' ? [secondPage, null, {}] : [firstPage, { prefix: 'd/', autoPaginate: false, pageToken: 'second' }, {}]
    })
    const outcome = settlement(storage.deleteDirectory({ bucket: 'b', name: 'd/' }))
    for (let round = 0; round < 100 && !outcome.settled; round++) {
      await settleTasks()
      deletes.releaseOldest()
    }
    expect(outcome).toEqual({ settled: true })
    expect(deletes.state.maxInFlight).toBeLessThanOrEqual(10)
    const lastFirstPageEnd = Math.max(...firstPage.map(file => deletes.log.indexOf(`end ${file.name}`)))
    expect(deletes.log.indexOf('list second')).toBeGreaterThan(lastFirstPageEnd)
  })

  it('STO-11, STOR-13: goes on past an empty page that has a next page', async () => {
    const storage = await create()
    const objects = [mockFileResolvingEveryCall('d/1'), mockFileResolvingEveryCall('d/2')]
    bucket.getFiles
      .mockResolvedValueOnce([[], { prefix: 'd/', autoPaginate: false, pageToken: 'second' }, {}])
      .mockResolvedValueOnce([objects, null, {}])
    await storage.deleteDirectory({ bucket: 'b', name: 'd/' })
    for (const object of objects) expect(object.delete).toHaveBeenCalledOnce()
  })

  it('STO-11, GF38: lists every page with autoPaginate off, though the next query the client returns omits it', async () => {
    const storage = await create()
    bucket.getFiles
      .mockResolvedValueOnce([[mockFileResolvingEveryCall('d/1')], { prefix: 'd/', pageToken: 'second' }, {}])
      .mockResolvedValueOnce([[mockFileResolvingEveryCall('d/2')], null, {}])
    await storage.deleteDirectory({ bucket: 'b', name: 'd/' })
    expect(bucket.getFiles.mock.calls).toEqual([
      [{ prefix: 'd/', autoPaginate: false }],
      [{ prefix: 'd/', autoPaginate: false, pageToken: 'second' }]
    ])
  })

  it('STO-9, STOR-11: hides a name only when it ends in .folderPlaceholder', async () => {
    const storage = await create()
    bucket.getFiles.mockResolvedValueOnce([[
      mockFileResolvingEveryCall('d/.folderPlaceholder'),
      mockFileResolvingEveryCall('d/.folderPlaceholder.txt'),
      mockFileResolvingEveryCall('d/a.folderPlaceholder.txt')
    ], {}, { prefixes: [] }])
    const listing = await storage.listDirectory({ bucket: 'b', name: 'd/' })
    expect(listing.files.map(file => file.name)).toEqual(['d/.folderPlaceholder.txt', 'd/a.folderPlaceholder.txt'])
  })

  it('STO-12, STOR-14: lists every page of the prefix, placeholders included, without a delimiter', async () => {
    const storage = await create()
    const { moves } = bucketHolding(['d/.folderPlaceholder', 'd/a', 'd/e/.folderPlaceholder'])
    await storage.moveDirectory({ bucket: 'b', name: 'd/' }, 'n/')
    expect(bucket.getFiles.mock.calls).toEqual([[{ prefix: 'd/' }]])
    expect(moves).toEqual(['n/.folderPlaceholder', 'n/a', 'n/e/.folderPlaceholder'])
  })

  it('STO-12, STOR-14: moves into its own subtree once', async () => {
    const storage = await create()
    const { moves } = bucketHolding(['d/a'])
    await storage.moveDirectory({ bucket: 'b', name: 'd/' }, 'd/x/')
    expect(moves).toEqual(['d/x/a'])
  })

  it('STO-12, STOR-14: moves one object at a time in listing order, to the literal new name', async () => {
    const storage = await create()
    const listed = [mockFileResolvingEveryCall('d/a'), mockFileResolvingEveryCall('d/b/c')]
    let finishFirstMove: () => void = () => {}
    listed[0].move.mockImplementationOnce(async () => await new Promise<void>(resolve => { finishFirstMove = resolve }))
    bucket.getFiles.mockResolvedValueOnce([listed])
    const moving = storage.moveDirectory({ bucket: 'b', name: 'd/' }, 'n$&/')
    await vi.waitFor(() => expect(listed[0].move).toHaveBeenCalledWith('n$&/a'))
    await new Promise(resolve => setTimeout(resolve, 10))
    expect(listed[1].move).not.toHaveBeenCalled()
    finishFirstMove()
    await moving
    expect(listed[1].move).toHaveBeenCalledWith('n$&/b/c')
  })

  it('STO-12, STOR-14: stops at the first failed move', async () => {
    const storage = await create()
    const listed = [mockFileResolvingEveryCall('d/a'), mockFileResolvingEveryCall('d/b')]
    const failure = Object.assign(new Error('forbidden'), { code: 403 })
    listed[0].move.mockRejectedValueOnce(failure)
    bucket.getFiles.mockResolvedValueOnce([listed])
    await expect(storage.moveDirectory({ bucket: 'b', name: 'd/' }, 'n/')).rejects.toBe(failure)
    expect(listed[1].move).not.toHaveBeenCalled()
  })

  it('STO-12, STOR-14: replaces only the leading name', async () => {
    const storage = await create()
    const listed = [mockFileResolvingEveryCall('d/d/y')]
    bucket.getFiles.mockResolvedValueOnce([listed])
    await storage.moveDirectory({ bucket: 'b', name: 'd/' }, 'x/')
    expect(listed[0].move).toHaveBeenCalledWith('x/d/y')
  })

  it('STO-6, STOR-7: ifAbsent wins over ifVersion, and only 412 maps to PreconditionFailedError', async () => {
    const storage = await create()
    const data = stream()
    await storage.uploadObject({ bucket: 'b', name: 'n' }, data, { ifAbsent: true, ifVersion: '5' })
    expect(fileNamed('n').save).toHaveBeenCalledWith(data, { preconditionOpts: { ifGenerationMatch: 0 } })
    for (const options of [{ ifAbsent: true }, { ifVersion: '5' }]) {
      const failure = Object.assign(new Error('http 500'), { code: 500 })
      fileNamed('n').save.mockRejectedValueOnce(failure)
      await expect(storage.uploadObject({ bucket: 'b', name: 'n' }, stream(), options)).rejects.toBe(failure)
    }
  })

  it('STO-7: deleteObject propagates its errors', async () => {
    const storage = await create()
    const failure = Object.assign(new Error('forbidden'), { code: 403 })
    fileNamed('n').delete.mockRejectedValueOnce(failure)
    await expect(storage.deleteObject({ bucket: 'b', name: 'n' })).rejects.toBe(failure)
    const moveFailure = Object.assign(new Error('not found'), { code: 404 })
    fileNamed('n').move.mockRejectedValueOnce(moveFailure)
    await expect(storage.moveObject({ bucket: 'b', name: 'n' }, 'new')).rejects.toBe(moveFailure)
  })
})

describe('the bucket check (GS14)', () => {
  it('STO-3, STOR-4: every method refuses an unregistered bucket before any request', async () => {
    const storage = await create()
    bucket.file.mockClear()
    const other = { bucket: 'other', name: 'dir/n' }
    const calls: Record<string, () => Promise<unknown>> = {
      getObject: async () => await storage.getObject(other),
      getPublicURL: async () => await storage.getPublicURL(other),
      uploadObject: async () => await storage.uploadObject(other, stream(), {}),
      moveObject: async () => await storage.moveObject(other, 'dir/m'),
      deleteObject: async () => await storage.deleteObject(other),
      getSignedURL: async () => await storage.getSignedURL(other, new Date(Date.now() + 60_000)),
      listDirectory: async () => await storage.listDirectory(other),
      createDirectory: async () => await storage.createDirectory(other),
      deleteDirectory: async () => await storage.deleteDirectory(other),
      moveDirectory: async () => await storage.moveDirectory(other, 'dir2')
    }
    for (const [method, call] of Object.entries(calls)) {
      await expect(call(), method).rejects.toThrow('bucket-unregistered')
      expect(instances[0].bucket, method).not.toHaveBeenCalled()
      expect(bucket.file, method).not.toHaveBeenCalled()
      expect(bucket.getFiles, method).not.toHaveBeenCalled()
    }
    expect(Object.keys(calls).sort()).toEqual(Object.keys(storage).sort())
  })
})

describe('the storage contract on Cloud Storage', () => {
  const notFound = () => Object.assign(new Error('No such object'), { code: 404 })

  it('STO-3, STOR-3, STOR-4: the directory methods check the name after the bucket', async () => {
    const storage = await create()
    bucket.file.mockClear()
    const calls = (bucketName: string) => ({
      listDirectory: async () => await storage.listDirectory({ bucket: bucketName, name: 'x' }),
      createDirectory: async () => await storage.createDirectory({ bucket: bucketName, name: 'x' }),
      deleteDirectory: async () => await storage.deleteDirectory({ bucket: bucketName, name: 'x' }),
      moveDirectory: async () => await storage.moveDirectory({ bucket: bucketName, name: 'x' }, 'y/'),
      moveDirectoryDestination: async () => await storage.moveDirectory({ bucket: bucketName, name: 'x/' }, 'y'),
      createRoot: async () => await storage.createDirectory({ bucket: bucketName, name: '' })
    })
    for (const [method, call] of Object.entries(calls('other'))) {
      await expect(call(), method).rejects.toThrow('bucket-unregistered')
    }
    for (const [method, call] of Object.entries(calls('b'))) {
      await expect(call(), method).rejects.toThrow('storage/not-a-directory')
    }
    expect(bucket.file).not.toHaveBeenCalled()
    expect(bucket.getFiles).not.toHaveBeenCalled()
  })

  it('STO-4, STOR-16: a 404 on the metadata rejects with ObjectNotFoundError', async () => {
    const storage = await create()
    fileNamed('n').getMetadata.mockRejectedValueOnce(notFound())
    const error = await storage.getObject({ bucket: 'b', name: 'n' }).then(() => undefined, (caught: unknown) => caught)
    expect(contracts.isNotFound(error)).toBe(true)
    expect((error as Error).message).toBe('storage/not-found: b/n')
  })

  it('STO-6, STOR-7: save receives only the precondition', async () => {
    const storage = await create()
    await storage.uploadObject({ bucket: 'b', name: 'n' }, 'x', { ifAbsent: true })
    expect(fileNamed('n').save).toHaveBeenLastCalledWith('x', { preconditionOpts: { ifGenerationMatch: 0 } })
    await storage.uploadObject({ bucket: 'b', name: 'n' }, 'x')
    expect(fileNamed('n').save).toHaveBeenLastCalledWith('x', {})
  })

  it('STO-7, STOR-16: a delete answered with 404 rejects with ObjectNotFoundError', async () => {
    const storage = await create()
    fileNamed('n').delete.mockRejectedValueOnce(notFound())
    const error = await storage.deleteObject({ bucket: 'b', name: 'n' }).then(() => undefined, (caught: unknown) => caught)
    expect(contracts.isNotFound(error)).toBe(true)
    expect((error as Error).message).toBe('storage/not-found: b/n')
  })

  it('STO-9, STOR-11: one request with limit, startOffset and pageToken; next from the response', async () => {
    const storage = await create()
    const entries = [mockFileResolvingEveryCall('p/2'), mockFileResolvingEveryCall('p/3')]
    bucket.getFiles.mockResolvedValueOnce([entries, { prefix: 'p/', autoPaginate: false, pageToken: 't2' }, { prefixes: [] }])
    const listing = await storage.listDirectory({ bucket: 'b', name: 'p/' }, { limit: 3, startAfter: 'p/1', pageToken: 't1' })
    expect(bucket.getFiles).toHaveBeenCalledOnce()
    expect(bucket.getFiles).toHaveBeenCalledWith({ prefix: 'p/', delimiter: '/', autoPaginate: false, maxResults: 3, startOffset: 'p/1', pageToken: 't1' })
    expect(listing.next).toBe('t2')
    bucket.getFiles.mockResolvedValueOnce([entries, null, { prefixes: [] }])
    const last = await storage.listDirectory({ bucket: 'b', name: 'p/' })
    expect(bucket.getFiles).toHaveBeenLastCalledWith({ prefix: 'p/', delimiter: '/', autoPaginate: false })
    expect(last.next).toBeUndefined()
  })

  it('STO-9, STOR-11: limit 0 lists nothing and sends no request', async () => {
    const storage = await create()
    const listing = await storage.listDirectory({ bucket: 'b', name: 'p/' }, { limit: 0 })
    expect(listing.files).toEqual([])
    expect(listing.directories).toEqual([])
    expect(bucket.getFiles).not.toHaveBeenCalled()
  })

  it('STO-9, STOR-11: an entry named startAfter is left out and nothing else is cut', async () => {
    const storage = await create()
    bucket.getFiles.mockResolvedValueOnce([[mockFileResolvingEveryCall('p/2'), mockFileResolvingEveryCall('p/3'), mockFileResolvingEveryCall('p/4')], null, { prefixes: [] }])
    const listing = await storage.listDirectory({ bucket: 'b', name: 'p/' }, { limit: 3, startAfter: 'p/2' })
    expect(listing.files.map(file => file.name)).toEqual(['p/3', 'p/4'])
  })

  it('STO-10, STOR-12: a directory is kept by the placeholder under its name', async () => {
    const storage = await create()
    await storage.createDirectory({ bucket: 'b', name: 'a/' })
    expect(fileNamed('a/.folderPlaceholder').save).toHaveBeenCalledWith('')
    expect(files.has('a//.folderPlaceholder')).toBe(false)
  })

  it('STOR-15: errors propagate unchanged', async () => {
    const consoleMethods = ['log', 'info', 'warn', 'error', 'debug'] as const
    const spies = consoleMethods.map(method => vi.spyOn(console, method).mockImplementation(() => {}))
    try {
      const storage = await create()
      const failure = Object.assign(new Error('boom'), { code: 500 })
      const rejection = async (call: () => Promise<unknown>): Promise<unknown> => await call().then(() => undefined, (caught: unknown) => caught)
      bucket.getFiles.mockRejectedValueOnce(failure)
      expect(await rejection(async () => await storage.listDirectory({ bucket: 'b', name: 'd/' }))).toBe(failure)
      fileNamed('n').save.mockRejectedValueOnce(failure)
      expect(await rejection(async () => await storage.uploadObject({ bucket: 'b', name: 'n' }, 'x'))).toBe(failure)
      fileNamed('n').save.mockRejectedValueOnce(failure)
      expect(await rejection(async () => await storage.uploadObject({ bucket: 'b', name: 'n' }, 'x', { ifAbsent: true }))).toBe(failure)
      fileNamed('n').move.mockRejectedValueOnce(failure)
      expect(await rejection(async () => await storage.moveObject({ bucket: 'b', name: 'n' }, 'm'))).toBe(failure)
      fileNamed('n').delete.mockRejectedValueOnce(failure)
      expect(await rejection(async () => await storage.deleteObject({ bucket: 'b', name: 'n' }))).toBe(failure)
      for (const spy of spies) expect(spy).not.toHaveBeenCalled()
    } finally {
      for (const spy of spies) spy.mockRestore()
    }
  })
})

describe('the storage contract on Cloud Storage, as every adapter keeps it', () => {
  const methods = ['getObject', 'getSignedURL', 'getPublicURL', 'uploadObject', 'moveObject', 'deleteObject', 'listDirectory', 'createDirectory', 'deleteDirectory', 'moveDirectory']

  it('STOR-2: the adapter has the ten methods, for the buckets it was given', async () => {
    const storage = await create()
    expect(Object.keys(storage).sort()).toEqual([...methods].sort())
    for (const method of methods) expect(storage[method as keyof typeof storage], method).toBeTypeOf('function')
    await expect(storage.getObject({ bucket: 'other', name: 'n' })).rejects.toThrow('bucket-unregistered')
  })

  it('STOR-3: names are used as given', async () => {
    const storage = await create()
    const names = ['a//b', './a', 'a/../b', ' Mixed Case/ä B.TXT ']
    for (const name of names) {
      await storage.getObject({ bucket: 'b', name })
      await storage.uploadObject({ bucket: 'b', name }, 'x', {})
      await storage.deleteObject({ bucket: 'b', name })
    }
    await storage.moveObject({ bucket: 'b', name: 'a//b' }, './a')
    expect(bucket.file.mock.calls.map(call => call[0])).toEqual(expect.arrayContaining(names))
    expect(fileNamed('a//b').move).toHaveBeenCalledWith('./a')
    for (const name of names) expect(fileNamed(name).save, name).toHaveBeenCalledWith('x', {})
  })

  it('STOR-7: a write resolves to undefined, whatever its condition', async () => {
    const storage = await create()
    expect(await storage.uploadObject({ bucket: 'b', name: 'n' }, 'x', {})).toBeUndefined()
    expect(await storage.uploadObject({ bucket: 'b', name: 'n' }, 'x', { ifAbsent: true })).toBeUndefined()
    expect(await storage.uploadObject({ bucket: 'b', name: 'n' }, 'x', { ifVersion: '5' })).toBeUndefined()
  })

  it('STOR-10: a move and a delete resolve to undefined', async () => {
    const storage = await create()
    expect(await storage.moveObject({ bucket: 'b', name: 'n' }, 'm')).toBeUndefined()
    expect(await storage.deleteObject({ bucket: 'b', name: 'n' })).toBeUndefined()
  })
})
