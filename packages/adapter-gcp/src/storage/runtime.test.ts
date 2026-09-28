import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Readable } from 'node:stream'
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

  it('STO-3, STO-4: refuses a bucket outside its resources, and reads a registered one with its generation', async () => {
    const storage = await runtime.create({ projectId: 'p' }, { name: 'a', resources: ['registered'] })
    await expect(storage.getObject({ bucket: 'other', name: 'n' })).rejects.toThrow('bucket-unregistered')
    expect(await storage.getObject({ bucket: 'registered', name: 'n' })).toEqual({ data: 'stream', version: '7' })
  })

  it('STO-4: reads without a version when the metadata call fails', async () => {
    const storage = await create()
    fileNamed('n').getMetadata.mockRejectedValueOnce(new Error('forbidden'))
    expect(await storage.getObject({ bucket: 'b', name: 'n' })).toEqual({ data: 'stream', version: undefined })
  })

  it('STO-6: creates atomically with ifAbsent', async () => {
    const storage = await create()
    const data = stream()
    await storage.uploadObject({ bucket: 'b', name: 'n' }, data, { ifAbsent: true })
    expect(fileNamed('n').save).toHaveBeenCalledWith(data, { preconditionOpts: { ifGenerationMatch: 0 } })
  })

  it('STO-6: writes conditionally on ifVersion, passing other options through', async () => {
    const storage = await create()
    const data = stream()
    await storage.uploadObject({ bucket: 'b', name: 'n' }, data, { ifVersion: '5', contentType: 'text/plain' } as any)
    expect(fileNamed('n').save).toHaveBeenCalledWith(data, { contentType: 'text/plain', preconditionOpts: { ifGenerationMatch: 5 } })
  })

  it('STO-6: writes unconditionally without a condition', async () => {
    const storage = await create()
    const data = stream()
    await storage.uploadObject({ bucket: 'b', name: 'n' }, data)
    expect(fileNamed('n').save).toHaveBeenCalledWith(data, {})
  })

  it('STO-6: maps a failed precondition to PreconditionFailedError', async () => {
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

  it('STO-7: moves and deletes a single object', async () => {
    const storage = await create()
    await storage.moveObject({ bucket: 'b', name: 'n' }, 'new')
    await storage.deleteObject({ bucket: 'b', name: 'n' })
    expect(fileNamed('n').move).toHaveBeenCalledWith('new')
    expect(fileNamed('n').delete).toHaveBeenCalled()
  })

  it('STO-9: lists one level, hiding placeholders and the directory itself', async () => {
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

  it('STO-10: creates a directory as a placeholder object', async () => {
    const storage = await create()
    await storage.createDirectory({ bucket: 'b', name: 'd' })
    expect(fileNamed('d/.folderPlaceholder').save).toHaveBeenCalledWith('')
  })

  it('STO-11: deletes every object under a directory', async () => {
    const storage = await create()
    const listed = [mockFileResolvingEveryCall('d/x'), mockFileResolvingEveryCall('d/e/y')]
    bucket.getFiles.mockResolvedValueOnce([listed])
    await storage.deleteDirectory({ bucket: 'b', name: 'd/' })
    expect(bucket.getFiles).toHaveBeenCalledWith({ prefix: 'd/' })
    for (const file of listed) expect(file.delete).toHaveBeenCalled()
  })

  it('STO-12: moves every object under a directory, replacing the first occurrence', async () => {
    const storage = await create()
    const listed = [mockFileResolvingEveryCall('d/x'), mockFileResolvingEveryCall('d/e/d/y')]
    bucket.getFiles.mockResolvedValueOnce([listed])
    await storage.moveDirectory({ bucket: 'b', name: 'd/' }, 'n/')
    expect(listed[0].move).toHaveBeenCalledWith('n/x')
    expect(listed[1].move).toHaveBeenCalledWith('n/e/d/y')
  })
})
