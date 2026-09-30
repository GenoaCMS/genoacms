import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Readable } from 'node:stream'
import { S3Client, HeadObjectCommand, GetObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import type { Adapter, ObjectReference, UploadOptions } from '@genoacms/contracts/storage'
import { PreconditionFailedError } from '@genoacms/contracts/storage'
import runtime from '../../src/storage/runtime.js'
import { enabled, region, bucket, objectPrefix, deleteRunObjects } from './aws.js'

const ONE_MINUTE = 60_000
const TEN_MINUTES_AHEAD = 10 * 60 * 1000

const objectName = (name: string): string => `${objectPrefix}${name}`
const ref = (name: string): ObjectReference => ({ bucket, name: objectName(name) })

let s3: S3Client
let storage: Adapter

async function readAll (stream: Readable): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf-8')
}

async function upload (name: string, content: string, options: UploadOptions = {}): Promise<void> {
  await storage.uploadObject(ref(name), content, options)
}

async function exists (name: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: objectName(name) }))
    return true
  } catch (error) {
    if ((error as { name?: string }).name === 'NotFound') return false
    throw error
  }
}

async function content (name: string): Promise<string> {
  const { Body } = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: objectName(name) }))
  return await readAll(Body as Readable)
}

async function versionOf (name: string): Promise<string | undefined> {
  const { data, version } = await storage.getObject(ref(name))
  await readAll(data as Readable)
  return version
}

describe.runIf(enabled)('S3, against the real service', { timeout: ONE_MINUTE }, () => {
  beforeAll(async () => {
    s3 = new S3Client({ region })
    storage = await runtime.create({ region }, { name: 'contract', resources: [bucket] })
  }, ONE_MINUTE)

  afterAll(async () => {
    await deleteRunObjects()
  }, 2 * ONE_MINUTE)

  it('OBJ-3: reads an object with its ETag as the version', async () => {
    await upload('read.txt', 'first')
    const { data, version } = await storage.getObject(ref('read.txt'))
    expect(await readAll(data as Readable)).toBe('first')
    const { ETag } = await s3.send(new HeadObjectCommand({ Bucket: bucket, Key: objectName('read.txt') }))
    expect(version).toBe(ETag)
  })

  it('OBJ-3: rejects a missing object with NoSuchKey', async () => {
    await expect(storage.getObject(ref('missing.txt'))).rejects.toMatchObject({ name: 'NoSuchKey' })
  })

  it('OBJ-5: serves the object through a presigned URL', async () => {
    await upload('signed.txt', 'signed')
    const url = await storage.getSignedURL(ref('signed.txt'), new Date(Date.now() + TEN_MINUTES_AHEAD))
    const response = await fetch(url)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('signed')
  })

  it('OBJ-6: creates with ifAbsent, and refuses a second create', async () => {
    await upload('create.txt', 'first', { ifAbsent: true })
    const second = upload('create.txt', 'second', { ifAbsent: true })
    await expect(second).rejects.toThrow(PreconditionFailedError)
    await expect(second).rejects.toThrow(`storage/precondition-failed: ${bucket}/${objectName('create.txt')}: object already exists`)
    expect(await content('create.txt')).toBe('first')
  })

  it('OBJ-6: writes on the current version, and refuses a stale one', async () => {
    await upload('version.txt', 'one')
    const read = await versionOf('version.txt')
    await upload('version.txt', 'two', { ifVersion: read })
    const stale = upload('version.txt', 'three', { ifVersion: read })
    await expect(stale).rejects.toThrow(PreconditionFailedError)
    await expect(stale).rejects.toThrow(`storage/precondition-failed: ${bucket}/${objectName('version.txt')}: object changed since it was read`)
    expect(await content('version.txt')).toBe('two')
  })

  it('OBJ-6: overwrites without a condition', async () => {
    await upload('overwrite.txt', 'a')
    await upload('overwrite.txt', 'b')
    expect(await content('overwrite.txt')).toBe('b')
  })

  it('OBJ-7: moves an object within its bucket, and deletes it', async () => {
    await upload('move.txt', 'moving')
    await storage.moveObject(ref('move.txt'), objectName('moved.txt'))
    expect(await exists('move.txt')).toBe(false)
    expect(await content('moved.txt')).toBe('moving')
    await storage.deleteObject(ref('moved.txt'))
    expect(await exists('moved.txt')).toBe(false)
  })

  it('OBJ-8: lists one level without placeholders or the directory itself', async () => {
    await upload('d/a.txt', 'aa')
    await upload('d/.folderPlaceholder', '')
    await upload('d/sub/b.txt', 'b')
    await upload('d/', '')
    const listing = await storage.listDirectory(ref('d/'))
    expect(listing.files.map(file => file.name)).toEqual([objectName('d/a.txt')])
    expect(listing.directories).toEqual([{ bucket, name: objectName('d/sub/') }])
  })

  it('OBJ-8: pages a listing with limit and startAfter', async () => {
    for (const name of ['p/1', 'p/2', 'p/3']) await upload(name, name)
    const firstPage = await storage.listDirectory(ref('p/'), { limit: 2 })
    expect(firstPage.files.map(file => file.name)).toEqual([objectName('p/1'), objectName('p/2')])
    const nextPage = await storage.listDirectory(ref('p/'), { startAfter: objectName('p/2') })
    expect(nextPage.files.map(file => file.name)).toEqual([objectName('p/3')])
  })

  it("OBJ-9: creates a directory that its parent's listing shows", async () => {
    await storage.createDirectory(ref('e'))
    expect(await exists('e/.folderPlaceholder')).toBe(true)
    const listing = await storage.listDirectory(ref(''))
    expect(listing.directories).toContainEqual({ bucket, name: objectName('e/') })
  })

  it('OBJ-10: deletes every object under a directory, at every depth, and nothing beside it', async () => {
    for (const name of ['f/1', 'f/g/2', 'f/g/h/3', 'fx/4']) await upload(name, name)
    await storage.deleteDirectory(ref('f/'))
    for (const name of ['f/1', 'f/g/2', 'f/g/h/3']) expect(await exists(name)).toBe(false)
    expect(await exists('fx/4')).toBe(true)
  })

  it('OBJ-11: moves every object under a directory, at every depth', async () => {
    await upload('m/1', 'one')
    await upload('m/n/2', 'two')
    await storage.moveDirectory(ref('m/'), objectName('mv/'))
    expect(await content('mv/1')).toBe('one')
    expect(await content('mv/n/2')).toBe('two')
    const { KeyCount } = await s3.send(new ListObjectsV2Command({ Bucket: bucket, Prefix: objectName('m/') }))
    expect(KeyCount).toBe(0)
  })
})
