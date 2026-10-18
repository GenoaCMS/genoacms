import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Readable } from 'node:stream'
import { mockClient } from 'aws-sdk-client-mock'
import {
  S3Client,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
  NoSuchKey,
  S3ServiceException
} from '@aws-sdk/client-s3'
import { Upload } from '@aws-sdk/lib-storage'
import * as contracts from '@genoacms/contracts/storage'
import { PreconditionFailedError } from '@genoacms/contracts/storage'
import runtime from './runtime.js'

const { constructed } = vi.hoisted(() => ({ constructed: [] as Array<{ client: unknown, config: unknown }> }))

vi.mock('@aws-sdk/client-s3', async (importOriginal) => {
  const original = await importOriginal<typeof import('@aws-sdk/client-s3')>()
  class RecordingS3Client extends original.S3Client {
    constructor (...args: ConstructorParameters<typeof original.S3Client>) {
      super(...args)
      constructed.push({ client: this, config: args[0] })
    }
  }
  return { ...original, S3Client: RecordingS3Client }
})

vi.mock('@aws-sdk/lib-storage', () => ({ Upload: vi.fn() }))

const s3 = mockClient(S3Client)
const credentials = { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'secret' }
const ref = { bucket: 'b', name: 'n' }

async function provider (resources: string[] = ['b'], region = 'eu-central-1') {
  return await runtime.create({ region, credentials }, { name: 'storage', resources })
}

function awsError (name: string, httpStatusCode: number): S3ServiceException {
  return new S3ServiceException({ name, $fault: 'client', $metadata: { httpStatusCode }, message: name })
}

function uploadSettles (outcome: () => Promise<unknown>): void {
  vi.mocked(Upload).mockImplementation(function () { return { done: outcome } } as never)
}

const inputs = <T>(command: new (...args: any[]) => T): any[] => s3.commandCalls(command as never).map(call => call.args[0].input)

function exactly (message: string): RegExp {
  return new RegExp(`^${message.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
}

beforeEach(() => {
  s3.reset()
  constructed.length = 0
  vi.mocked(Upload).mockReset()
  uploadSettles(async () => ({}))
})

afterEach(() => { vi.useRealTimers() })

describe('the S3 runtime', () => {
  it('AWS-4: passes credentials only when given, and keeps providers apart', async () => {
    await runtime.create({ region: 'eu-central-1', credentials }, { name: 'one', resources: ['b'] })
    await runtime.create({ region: 'us-east-1' }, { name: 'two', resources: ['b'] })
    expect(constructed).toHaveLength(2)
    expect(constructed[0].client).not.toBe(constructed[1].client)
    expect(constructed[0].config).toEqual({ region: 'eu-central-1', credentials })
    expect(constructed[1].config).toEqual({ region: 'us-east-1' })
  })

  it('OBJ-2, STOR-4: refuses an unregistered bucket before any request, in every method', async () => {
    const storage = await provider(['a'])
    const other = { bucket: 'b', name: 'n/' }
    const calls: Array<() => unknown> = [
      () => storage.getObject(other),
      () => storage.getSignedURL(other, new Date(Date.now() + 60_000)),
      () => storage.getPublicURL(other),
      () => storage.uploadObject(other, 'x', {}),
      () => storage.moveObject(other, 'm'),
      () => storage.deleteObject(other),
      () => storage.listDirectory(other),
      () => storage.createDirectory(other),
      () => storage.deleteDirectory(other),
      () => storage.moveDirectory(other, 'm/')
    ]
    for (const call of calls) {
      await expect((async () => await call())()).rejects.toThrow(exactly('bucket-unregistered'))
    }
    expect(s3.calls()).toHaveLength(0)
  })

  it('OBJ-3, STOR-5: returns the body and the ETag', async () => {
    const body = Readable.from(['content'])
    s3.on(GetObjectCommand).resolves({ Body: body as never, ETag: '"e1"' })
    const storage = await provider()
    const object = await storage.getObject(ref)
    expect(object.data).toBe(body)
    expect(object.version).toBe('"e1"')
    expect(inputs(GetObjectCommand)).toEqual([expect.objectContaining({ Bucket: 'b', Key: 'n' })])
  })

  it('OBJ-3: propagates other errors unchanged', async () => {
    const storage = await provider()
    const denied = awsError('AccessDenied', 403)
    s3.on(GetObjectCommand).rejectsOnce(denied)
    await expect(storage.getObject(ref)).rejects.toBe(denied)
  })

  it("OBJ-4: builds the public URL from the provider's region, encoding the name", async () => {
    const storage = await provider()
    expect(await storage.getPublicURL({ bucket: 'b', name: 'd/a b.txt' })).toBe('https://b.s3.eu-central-1.amazonaws.com/d%2Fa%20b.txt')
  })

  it('OBJ-5, STOR-9: presigns a GetObject for the whole seconds until expiry', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const now = Date.UTC(2026, 8, 30, 12, 0, 0)
    vi.setSystemTime(now)
    const storage = await provider(['genoacms-test'])
    const url = new URL(await storage.getSignedURL({ bucket: 'genoacms-test', name: 'd/a.txt' }, new Date(now + 90_900)))
    expect(url.searchParams.get('X-Amz-Expires')).toBe('90')
    expect(url.host).toBe('genoacms-test.s3.eu-central-1.amazonaws.com')
    expect(url.pathname).toBe('/d/a.txt')
  })

  it('OBJ-6, STOR-7: ifAbsent sends IfNoneMatch and wins over ifVersion', async () => {
    s3.on(PutObjectCommand).resolves({})
    const storage = await provider()
    await storage.uploadObject(ref, 'data', { ifAbsent: true, ifVersion: '"e"' })
    const puts = inputs(PutObjectCommand)
    expect(puts).toHaveLength(1)
    expect(puts[0]).toMatchObject({ Bucket: 'b', Key: 'n', Body: 'data', IfNoneMatch: '*' })
    expect(puts[0].IfMatch).toBeUndefined()
  })

  it('OBJ-6, STOR-7: ifVersion sends IfMatch', async () => {
    s3.on(PutObjectCommand).resolves({})
    const storage = await provider()
    await storage.uploadObject(ref, 'data', { ifVersion: '"e"' })
    const puts = inputs(PutObjectCommand)
    expect(puts).toHaveLength(1)
    expect(puts[0]).toMatchObject({ Bucket: 'b', Key: 'n', Body: 'data', IfMatch: '"e"' })
    expect(puts[0].IfNoneMatch).toBeUndefined()
  })

  it('OBJ-6, STOR-7: maps 412 and 409 to PreconditionFailedError with the reason', async () => {
    const storage = await provider()
    s3.on(PutObjectCommand).rejectsOnce(awsError('PreconditionFailed', 412)).rejectsOnce(awsError('ConditionalRequestConflict', 409))
    const stale = storage.uploadObject(ref, 'data', { ifVersion: '"e"' })
    await expect(stale).rejects.toBeInstanceOf(PreconditionFailedError)
    await expect(stale).rejects.toThrow(exactly('storage/precondition-failed: b/n: object changed since it was read'))
    const conflict = storage.uploadObject(ref, 'data', { ifAbsent: true })
    await expect(conflict).rejects.toBeInstanceOf(PreconditionFailedError)
    await expect(conflict).rejects.toThrow(exactly('storage/precondition-failed: b/n: object already exists'))
  })

  it('OBJ-6: propagates other errors of a conditional write unchanged', async () => {
    const storage = await provider()
    const denied = awsError('AccessDenied', 403)
    s3.on(PutObjectCommand).rejects(denied)
    await expect(storage.uploadObject(ref, 'data', { ifVersion: '"e"' })).rejects.toBe(denied)
  })

  it('OBJ-6, STOR-7: writes unconditionally through the multipart uploader, propagating its errors', async () => {
    const failure = new Error('upload failed')
    uploadSettles(async () => { throw failure })
    const storage = await provider()
    await expect(storage.uploadObject(ref, 'data', {})).rejects.toBe(failure)
    expect(Upload).toHaveBeenCalledOnce()
    expect(vi.mocked(Upload).mock.calls[0][0]).toMatchObject({ params: { Bucket: 'b', Key: 'n', Body: 'data' } })
    const conditional = inputs(PutObjectCommand).filter(input => input.IfMatch !== undefined || input.IfNoneMatch !== undefined)
    expect(conditional).toEqual([])
  })

  it('OBJ-7, STOR-10: moves by copy then delete, and deletes nothing when the copy fails', async () => {
    s3.on(CopyObjectCommand).resolves({})
    s3.on(DeleteObjectCommand).resolves({})
    const storage = await provider()
    await storage.moveObject({ bucket: 'b', name: 'd/a.txt' }, 'e/b.txt')
    const sent = s3.calls().map(call => call.args[0])
    expect(sent).toHaveLength(2)
    expect(sent[0]).toBeInstanceOf(CopyObjectCommand)
    expect(sent[0].input).toMatchObject({ Bucket: 'b', CopySource: 'b/d%2Fa.txt', Key: 'e/b.txt' })
    expect(sent[1]).toBeInstanceOf(DeleteObjectCommand)
    expect(sent[1].input).toMatchObject({ Bucket: 'b', Key: 'd/a.txt' })

    s3.reset()
    const failure = awsError('AccessDenied', 403)
    s3.on(CopyObjectCommand).rejects(failure)
    await expect(storage.moveObject({ bucket: 'b', name: 'd/a.txt' }, 'e/b.txt')).rejects.toBe(failure)
    expect(s3.commandCalls(DeleteObjectCommand)).toHaveLength(0)
  })

  it('OBJ-7: propagates delete errors unchanged', async () => {
    const failure = awsError('AccessDenied', 403)
    s3.on(DeleteObjectCommand).rejects(failure)
    const storage = await provider()
    await expect(storage.deleteObject(ref)).rejects.toBe(failure)
    expect(inputs(DeleteObjectCommand)).toEqual([expect.objectContaining({ Bucket: 'b', Key: 'n' })])
  })

  it('OBJ-8, STOR-11: lists one level with the given limit and startAfter only', async () => {
    s3.on(ListObjectsV2Command).resolves({ Contents: [], CommonPrefixes: [], IsTruncated: true, NextContinuationToken: 'next' })
    const storage = await provider()
    await storage.listDirectory({ bucket: 'b', name: 'd/' }, { limit: 10, startAfter: 'd/a' })
    expect(inputs(ListObjectsV2Command)).toEqual([{ Bucket: 'b', Prefix: 'd/', Delimiter: '/', MaxKeys: 10, StartAfter: 'd/a' }])

    s3.resetHistory()
    await storage.listDirectory({ bucket: 'b', name: 'd/' })
    expect(inputs(ListObjectsV2Command)).toEqual([{ Bucket: 'b', Prefix: 'd/', Delimiter: '/' }])
  })

  it('OBJ-8, STOR-11: hides placeholders and the directory itself, and returns directories as references', async () => {
    const lastModified = new Date('2026-09-30T12:00:00Z')
    s3.on(ListObjectsV2Command).resolves({
      Contents: [
        { Key: 'd/', Size: 0, LastModified: lastModified },
        { Key: 'd/a.txt', Size: 2, LastModified: lastModified },
        { Key: 'd/x.folderPlaceholder', Size: 0, LastModified: lastModified },
        { Key: 'd/sizeless.txt', LastModified: lastModified }
      ],
      CommonPrefixes: [{ Prefix: 'd/' }, { Prefix: 'd/s/' }]
    })
    const storage = await provider()
    const listing = await storage.listDirectory({ bucket: 'b', name: 'd/' })
    expect(listing.files).toEqual([
      { name: 'd/a.txt', size: 2, lastModified },
      { name: 'd/sizeless.txt', size: 0, lastModified }
    ])
    expect(listing.directories).toEqual([{ bucket: 'b', name: 'd/s/' }])
  })

  it('OBJ-8, STOR-11: returns directories when there are no files', async () => {
    s3.on(ListObjectsV2Command).resolves({ CommonPrefixes: [{ Prefix: 'd/s/' }, { Prefix: 'd/t/' }] })
    const storage = await provider()
    const listing = await storage.listDirectory({ bucket: 'b', name: 'd/' })
    expect(listing.files).toEqual([])
    expect(listing.directories).toEqual([{ bucket: 'b', name: 'd/s/' }, { bucket: 'b', name: 'd/t/' }])
  })

  it('OBJ-10, STOR-13: deletes every page of objects in batches of at most 1000', async () => {
    const keys = Array.from({ length: 2500 }, (_, index) => `f/${index}`)
    s3.on(ListObjectsV2Command)
      .resolvesOnce({ Contents: keys.slice(0, 1000).map(Key => ({ Key })), IsTruncated: true, NextContinuationToken: 't1' })
      .resolvesOnce({ Contents: keys.slice(1000).map(Key => ({ Key })), IsTruncated: false })
    s3.on(DeleteObjectsCommand).resolves({})
    const storage = await provider()
    await storage.deleteDirectory({ bucket: 'b', name: 'f/' })
    const lists = inputs(ListObjectsV2Command)
    expect(lists).toHaveLength(2)
    expect(lists[0]).toMatchObject({ Bucket: 'b', Prefix: 'f/' })
    expect(lists[0].Delimiter).toBeUndefined()
    expect(lists[1]).toMatchObject({ Bucket: 'b', Prefix: 'f/', ContinuationToken: 't1' })
    const deletes = inputs(DeleteObjectsCommand)
    expect(deletes.map(input => input.Delete.Objects.length)).toEqual([1000, 1000, 500])
    for (const input of deletes) expect(input).toMatchObject({ Bucket: 'b', Delete: { Quiet: true } })
    expect(deletes.flatMap(input => input.Delete.Objects)).toEqual(keys.map(Key => ({ Key })))
  })

  it('OBJ-10, STOR-13: throws storage/delete-failed for a key the response reports', async () => {
    s3.on(ListObjectsV2Command).resolves({ Contents: [{ Key: 'f/1' }, { Key: 'f/2' }] })
    s3.on(DeleteObjectsCommand).resolves({ Errors: [{ Key: 'f/1', Code: 'AccessDenied' }] })
    const storage = await provider()
    await expect(storage.deleteDirectory({ bucket: 'b', name: 'f/' })).rejects.toThrow(exactly('storage/delete-failed: b/f/1: AccessDenied'))
  })

  it('OBJ-11, STOR-14: moves every object to the new prefix, keeping the rest of each name', async () => {
    s3.on(ListObjectsV2Command).resolves({ Contents: [{ Key: 'm/1' }, { Key: 'm/n/2' }, { Key: 'm/x$&y' }] })
    s3.on(CopyObjectCommand).resolves({})
    s3.on(DeleteObjectCommand).resolves({})
    const storage = await provider()
    await storage.moveDirectory({ bucket: 'b', name: 'm/' }, 'n$&/')
    expect(inputs(CopyObjectCommand)).toEqual([
      expect.objectContaining({ Bucket: 'b', CopySource: `b/${encodeURIComponent('m/1')}`, Key: 'n$&/1' }),
      expect.objectContaining({ Bucket: 'b', CopySource: `b/${encodeURIComponent('m/n/2')}`, Key: 'n$&/n/2' }),
      expect.objectContaining({ Bucket: 'b', CopySource: `b/${encodeURIComponent('m/x$&y')}`, Key: 'n$&/x$&y' })
    ])
    expect(inputs(DeleteObjectCommand).map(input => input.Key).sort()).toEqual(['m/1', 'm/n/2', 'm/x$&y'].sort())
  })

  it('OBJ-11, STOR-14: stops at the first failure', async () => {
    const failure = awsError('AccessDenied', 403)
    s3.on(ListObjectsV2Command).resolves({ Contents: [{ Key: 'm/1' }, { Key: 'm/2' }, { Key: 'm/3' }] })
    s3.on(CopyObjectCommand).resolvesOnce({}).rejectsOnce(failure).resolves({})
    s3.on(DeleteObjectCommand).resolves({})
    const storage = await provider()
    await expect(storage.moveDirectory({ bucket: 'b', name: 'm/' }, 'n/')).rejects.toBe(failure)
    expect(inputs(CopyObjectCommand)).toHaveLength(2)
    expect(inputs(DeleteObjectCommand).map(input => input.Key)).not.toContain('m/2')
  })

  it('OBJ-3, STOR-3: reads the object by its name exactly as given', async () => {
    s3.on(GetObjectCommand).resolves({ Body: Readable.from(['x']) as never, ETag: '"e"' })
    const storage = await provider()
    await storage.getObject({ bucket: 'b', name: ' Mixed Case/ä B.TXT ' })
    expect(inputs(GetObjectCommand)).toEqual([expect.objectContaining({ Bucket: 'b', Key: ' Mixed Case/ä B.TXT ' })])
  })

  it('OBJ-5: signs only a GetObject of the object, with no other query parameter', async () => {
    const storage = await provider()
    const url = new URL(await storage.getSignedURL({ bucket: 'b', name: 'd/a.txt' }, new Date(Date.now() + 60_000)))
    expect(url.searchParams.get('x-id')).toBe('GetObject')
    for (const key of url.searchParams.keys()) expect(key).toMatch(/^(x-amz-.+|x-id)$/i)
  })

  it("OBJ-5: propagates the presigner's refusal of a lifetime over 604800 seconds", async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    const now = Date.UTC(2026, 8, 30, 12, 0, 0)
    vi.setSystemTime(now)
    const storage = await provider()
    await expect(storage.getSignedURL(ref, new Date(now + 604_801_000))).rejects.toThrow(/one week/)
    const url = new URL(await storage.getSignedURL(ref, new Date(now + 604_800_000)))
    expect(url.searchParams.get('X-Amz-Expires')).toBe('604800')
  })

  it('OBJ-7: propagates the delete error of a move after a successful copy', async () => {
    const failure = awsError('AccessDenied', 403)
    s3.on(CopyObjectCommand).resolves({})
    s3.on(DeleteObjectCommand).rejects(failure)
    const storage = await provider()
    await expect(storage.moveObject({ bucket: 'b', name: 'd/a.txt' }, 'e/b.txt')).rejects.toBe(failure)
  })

  it('OBJ-8, STOR-11: uses an empty name as given', async () => {
    s3.on(ListObjectsV2Command).resolves({})
    const storage = await provider()
    await storage.listDirectory({ bucket: 'b', name: '' })
    expect(inputs(ListObjectsV2Command)).toEqual([{ Bucket: 'b', Prefix: '', Delimiter: '/' }])
  })

  it('OBJ-8, STOR-11: hides only names that end in .folderPlaceholder', async () => {
    const lastModified = new Date('2026-09-30T12:00:00Z')
    s3.on(ListObjectsV2Command).resolves({
      Contents: [
        { Key: 'd/.folderPlaceholder', Size: 0, LastModified: lastModified },
        { Key: 'd/.folderPlaceholder.txt', Size: 1, LastModified: lastModified },
        { Key: 'd/a.folderPlaceholder-old', Size: 2, LastModified: lastModified }
      ]
    })
    const storage = await provider()
    const listing = await storage.listDirectory({ bucket: 'b', name: 'd/' })
    expect(listing.files).toEqual([
      { name: 'd/.folderPlaceholder.txt', size: 1, lastModified },
      { name: 'd/a.folderPlaceholder-old', size: 2, lastModified }
    ])
  })

  it('OBJ-10, STOR-13: sends no DeleteObjects for an empty directory', async () => {
    s3.on(ListObjectsV2Command).resolves({})
    s3.on(DeleteObjectsCommand).resolves({})
    const storage = await provider()
    await storage.deleteDirectory({ bucket: 'b', name: 'f/' })
    expect(s3.commandCalls(DeleteObjectsCommand)).toHaveLength(0)
  })

  it('OBJ-11, STOR-14: moves placeholders and the object named exactly name too', async () => {
    s3.on(ListObjectsV2Command).resolves({ Contents: [{ Key: 'm/' }, { Key: 'm/.folderPlaceholder' }, { Key: 'm/s/.folderPlaceholder' }, { Key: 'm/1' }] })
    s3.on(CopyObjectCommand).resolves({})
    s3.on(DeleteObjectCommand).resolves({})
    const storage = await provider()
    await storage.moveDirectory({ bucket: 'b', name: 'm/' }, 'n/')
    expect(inputs(CopyObjectCommand).map(input => [input.CopySource, input.Key])).toEqual([
      [`b/${encodeURIComponent('m/')}`, 'n/'],
      [`b/${encodeURIComponent('m/.folderPlaceholder')}`, 'n/.folderPlaceholder'],
      [`b/${encodeURIComponent('m/s/.folderPlaceholder')}`, 'n/s/.folderPlaceholder'],
      [`b/${encodeURIComponent('m/1')}`, 'n/1']
    ])
    expect(inputs(DeleteObjectCommand).map(input => input.Key)).toEqual(['m/', 'm/.folderPlaceholder', 'm/s/.folderPlaceholder', 'm/1'])
  })
})

describe('the storage contract on S3', () => {
  it('OBJ-2, STOR-3, STOR-4: the directory methods check the name after the bucket', async () => {
    const storage = await provider(['b'])
    const calls = (bucketName: string) => ({
      listDirectory: async () => await storage.listDirectory({ bucket: bucketName, name: 'x' }),
      createDirectory: async () => await storage.createDirectory({ bucket: bucketName, name: 'x' }),
      deleteDirectory: async () => await storage.deleteDirectory({ bucket: bucketName, name: 'x' }),
      moveDirectory: async () => await storage.moveDirectory({ bucket: bucketName, name: 'x' }, 'y/'),
      moveDirectoryDestination: async () => await storage.moveDirectory({ bucket: bucketName, name: 'x/' }, 'y'),
      createRoot: async () => await storage.createDirectory({ bucket: bucketName, name: '' })
    })
    for (const [method, call] of Object.entries(calls('other'))) {
      await expect(call(), method).rejects.toThrow(exactly('bucket-unregistered'))
    }
    for (const [method, call] of Object.entries(calls('b'))) {
      await expect(call(), method).rejects.toThrow('storage/not-a-directory')
    }
    expect(s3.calls()).toHaveLength(0)
  })

  it('OBJ-3, STOR-16: NoSuchKey rejects with ObjectNotFoundError', async () => {
    const storage = await provider()
    s3.on(GetObjectCommand).rejects(new NoSuchKey({ message: 'missing', $metadata: { httpStatusCode: 404 } }))
    const error = await storage.getObject(ref).then(() => undefined, (caught: unknown) => caught)
    expect(contracts.isNotFound(error)).toBe(true)
    expect((error as Error).message).toBe('storage/not-found: b/n')
  })

  it('OBJ-7, STOR-16: a delete heads first, and a 404 sends no DeleteObject', async () => {
    const storage = await provider()
    s3.on(HeadObjectCommand).resolves({})
    s3.on(DeleteObjectCommand).resolves({})
    await storage.deleteObject(ref)
    const sent = s3.calls().map(call => call.args[0])
    expect(sent).toHaveLength(2)
    expect(sent[0]).toBeInstanceOf(HeadObjectCommand)
    expect(sent[0].input).toMatchObject({ Bucket: 'b', Key: 'n' })
    expect(sent[1]).toBeInstanceOf(DeleteObjectCommand)
    expect(sent[1].input).toMatchObject({ Bucket: 'b', Key: 'n' })

    s3.reset()
    s3.on(HeadObjectCommand).rejects(awsError('NotFound', 404))
    s3.on(DeleteObjectCommand).resolves({})
    const error = await storage.deleteObject(ref).then(() => undefined, (caught: unknown) => caught)
    expect(contracts.isNotFound(error)).toBe(true)
    expect((error as Error).message).toBe('storage/not-found: b/n')
    expect(s3.commandCalls(DeleteObjectCommand)).toHaveLength(0)
  })

  it('OBJ-8, STOR-11: ContinuationToken in, NextContinuationToken out only when truncated', async () => {
    const storage = await provider()
    s3.on(ListObjectsV2Command).resolvesOnce({ IsTruncated: true, NextContinuationToken: 't2' })
      .resolvesOnce({ IsTruncated: false, NextContinuationToken: 'ignored' })
      .resolvesOnce({ NextContinuationToken: 'ignored' })
    const first = await storage.listDirectory({ bucket: 'b', name: 'd/' }, { limit: 3, pageToken: 't1' })
    expect(inputs(ListObjectsV2Command)[0]).toEqual({ Bucket: 'b', Prefix: 'd/', Delimiter: '/', MaxKeys: 3, ContinuationToken: 't1' })
    expect(first.next).toBe('t2')
    expect((await storage.listDirectory({ bucket: 'b', name: 'd/' })).next).toBeUndefined()
    expect((await storage.listDirectory({ bucket: 'b', name: 'd/' })).next).toBeUndefined()
  })

  it('OBJ-9, STOR-12: a directory is its name and the placeholder', async () => {
    s3.on(PutObjectCommand).resolves({})
    const storage = await provider()
    await storage.createDirectory({ bucket: 'b', name: 'e/' })
    const puts = inputs(PutObjectCommand)
    expect(puts).toHaveLength(1)
    expect(puts[0]).toMatchObject({ Bucket: 'b', Key: 'e/.folderPlaceholder' })
    expect(Buffer.from(puts[0].Body ?? '')).toHaveLength(0)
    expect(s3.calls()).toHaveLength(1)
  })

  it('STOR-15: errors propagate unchanged', async () => {
    const consoleMethods = ['log', 'info', 'warn', 'error', 'debug'] as const
    const spies = consoleMethods.map(method => vi.spyOn(console, method).mockImplementation(() => {}))
    try {
      const storage = await provider()
      const failure = awsError('InternalError', 500)
      const rejection = async (call: () => Promise<unknown>): Promise<unknown> => await call().then(() => undefined, (caught: unknown) => caught)
      s3.on(ListObjectsV2Command).rejects(failure)
      expect(await rejection(async () => await storage.listDirectory({ bucket: 'b', name: 'd/' }))).toBe(failure)
      s3.on(PutObjectCommand).rejects(failure)
      expect(await rejection(async () => await storage.uploadObject(ref, 'x', { ifAbsent: true }))).toBe(failure)
      s3.on(CopyObjectCommand).rejects(failure)
      expect(await rejection(async () => await storage.moveObject(ref, 'm'))).toBe(failure)
      s3.on(HeadObjectCommand).resolves({})
      s3.on(DeleteObjectCommand).rejects(failure)
      expect(await rejection(async () => await storage.deleteObject(ref))).toBe(failure)
      for (const spy of spies) expect(spy).not.toHaveBeenCalled()
    } finally {
      for (const spy of spies) spy.mockRestore()
    }
  })
})

describe('the storage contract on S3, as every adapter keeps it', () => {
  const methods = ['getObject', 'getSignedURL', 'getPublicURL', 'uploadObject', 'moveObject', 'deleteObject', 'listDirectory', 'createDirectory', 'deleteDirectory', 'moveDirectory']

  it('STOR-2: the adapter has the ten methods, for the buckets it was given', async () => {
    const storage = await provider()
    expect(Object.keys(storage).sort()).toEqual([...methods].sort())
    for (const method of methods) expect(storage[method as keyof typeof storage], method).toBeTypeOf('function')
    await expect(storage.getObject({ bucket: 'other', name: 'n' })).rejects.toThrow(exactly('bucket-unregistered'))
  })

  it('STOR-3: names are used as given', async () => {
    s3.on(GetObjectCommand).resolves({ Body: Readable.from(['x']) as never })
    s3.on(HeadObjectCommand).resolves({})
    s3.on(DeleteObjectCommand).resolves({})
    s3.on(CopyObjectCommand).resolves({})
    s3.on(PutObjectCommand).resolves({})
    const storage = await provider()
    const names = ['a//b', './a', 'a/../b', ' Mixed Case/ä B.TXT ']
    for (const name of names) {
      await storage.getObject({ bucket: 'b', name })
      await storage.uploadObject({ bucket: 'b', name }, 'x', { ifAbsent: true })
      await storage.deleteObject({ bucket: 'b', name })
    }
    await storage.moveObject({ bucket: 'b', name: 'a//b' }, './a')
    expect(inputs(GetObjectCommand).map(input => input.Key)).toEqual(names)
    expect(inputs(PutObjectCommand).map(input => input.Key)).toEqual(names)
    expect(inputs(DeleteObjectCommand).map(input => input.Key)).toEqual([...names, 'a//b'])
    expect(inputs(CopyObjectCommand)).toEqual([expect.objectContaining({ Key: './a', CopySource: `b/${encodeURIComponent('a//b')}` })])
  })

  it('STOR-7: a write resolves to undefined, whatever its condition', async () => {
    s3.on(PutObjectCommand).resolves({})
    const storage = await provider()
    expect(await storage.uploadObject(ref, 'x', {})).toBeUndefined()
    expect(await storage.uploadObject(ref, 'x', { ifAbsent: true })).toBeUndefined()
    expect(await storage.uploadObject(ref, 'x', { ifVersion: '"e"' })).toBeUndefined()
  })

  it('STOR-9: neither URL sends a request, so neither needs the object to exist', async () => {
    const storage = await provider()
    await storage.getPublicURL({ bucket: 'b', name: 'never-written' })
    await storage.getSignedURL({ bucket: 'b', name: 'never-written' }, new Date(Date.now() + 60_000))
    expect(s3.calls()).toHaveLength(0)
  })

  it('STOR-10: a move and a delete resolve to undefined', async () => {
    s3.on(CopyObjectCommand).resolves({})
    s3.on(DeleteObjectCommand).resolves({})
    s3.on(HeadObjectCommand).resolves({})
    const storage = await provider()
    expect(await storage.moveObject(ref, 'm')).toBeUndefined()
    expect(await storage.deleteObject(ref)).toBeUndefined()
  })
})
