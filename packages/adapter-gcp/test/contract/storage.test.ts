import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { Readable } from 'node:stream'
import { Storage } from '@google-cloud/storage'
import type { Adapter, ObjectReference } from '@genoacms/contracts/storage'
import { PreconditionFailedError } from '@genoacms/contracts/storage'
import runtime from '../../src/storage/runtime.js'
import { enabled, projectId, bucket, objectPrefix } from './gcp.js'

const sdkBucket = () => new Storage({ projectId }).bucket(bucket)
const objectName = (name: string): string => `${objectPrefix}${name}`
const ref = (name: string): ObjectReference => ({ bucket, name: objectName(name) })

let storage: Adapter

async function readAll (stream: Readable): Promise<string> {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf-8')
}

async function upload (name: string, content: string, options?: Parameters<Adapter['uploadObject']>[2]): Promise<void> {
  await storage.uploadObject(ref(name), content, options)
}

async function exists (name: string): Promise<boolean> {
  const [found] = await sdkBucket().file(objectName(name)).exists()
  return found
}

async function content (name: string): Promise<string> {
  const [bytes] = await sdkBucket().file(objectName(name)).download()
  return bytes.toString('utf-8')
}

async function versionOf (name: string): Promise<string | undefined> {
  const { data, version } = await storage.getObject(ref(name))
  await readAll(data as Readable)
  return version
}

describe.runIf(enabled)('Cloud Storage, against the real service', () => {
  beforeAll(async () => {
    storage = await runtime.create({ projectId }, { name: 'contract', resources: [bucket] })
  })

  afterAll(async () => {
    await sdkBucket().deleteFiles({ prefix: objectPrefix })
  })

  it('STO-4: reads an object with its current generation as the version', async () => {
    await upload('read.txt', 'first')
    const { data, version } = await storage.getObject(ref('read.txt'))
    expect(await readAll(data as Readable)).toBe('first')
    const [metadata] = await sdkBucket().file(objectName('read.txt')).getMetadata()
    expect(version).toMatch(/^\d+$/)
    expect(version).toBe(String(metadata.generation))
  })

  it('STO-4: reads a missing object without a version', async () => {
    const { data, version } = await storage.getObject(ref('missing.txt'))
    expect(version).toBeUndefined()
    await expect(readAll(data as Readable)).rejects.toMatchObject({ code: 404 })
  })

  it('STO-6: creates with ifAbsent, and refuses a second create', async () => {
    await upload('create.txt', 'first', { ifAbsent: true })
    const second = upload('create.txt', 'second', { ifAbsent: true })
    await expect(second).rejects.toThrow(PreconditionFailedError)
    await expect(second).rejects.toThrow(`storage/precondition-failed: ${bucket}/${objectName('create.txt')}: object already exists`)
    expect(await content('create.txt')).toBe('first')
  })

  it('STO-6: writes on the current version, and refuses a stale one', async () => {
    await upload('version.txt', 'one')
    const read = await versionOf('version.txt')
    await upload('version.txt', 'two', { ifVersion: read })
    const stale = upload('version.txt', 'three', { ifVersion: read })
    await expect(stale).rejects.toThrow(PreconditionFailedError)
    await expect(stale).rejects.toThrow('object changed since it was read')
    expect(await content('version.txt')).toBe('two')
  })

  it('STO-6: overwrites without a condition', async () => {
    await upload('overwrite.txt', 'a')
    await upload('overwrite.txt', 'b')
    expect(await content('overwrite.txt')).toBe('b')
  })

  it('STO-7: moves an object within its bucket, and deletes it', async () => {
    await upload('move.txt', 'moving')
    await storage.moveObject(ref('move.txt'), objectName('moved.txt'))
    expect(await exists('move.txt')).toBe(false)
    expect(await content('moved.txt')).toBe('moving')
    await storage.deleteObject(ref('moved.txt'))
    expect(await exists('moved.txt')).toBe(false)
  })

  it('STO-8: serves the object through a URL signed as the test identity', async () => {
    await upload('signed.txt', 'signed')
    const expires = Date.now() + 10 * 60 * 1000
    const url = new URL(await storage.getSignedURL(ref('signed.txt'), expires))
    expect(url.origin).toBe('https://storage.googleapis.com')
    expect(url.pathname).toBe(`/${bucket}/${objectName('signed.txt')}`)
    expect(url.searchParams.get('GoogleAccessId')).toMatch(/@/)
    expect(url.searchParams.get('Expires')).toBe(String(Math.floor(expires / 1000)))
    expect(url.searchParams.get('Signature')).not.toBeNull()
    const response = await fetch(url)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe('signed')
  })

  it('STO-9: lists one level without placeholders or the directory itself', async () => {
    await upload('d/a.txt', 'aa')
    await upload('d/.folderPlaceholder', '')
    await upload('d/sub/b.txt', 'b')
    await upload('d/', '')
    const listing = await storage.listDirectory(ref('d/'))
    expect(listing.files).toEqual([{ name: objectName('d/a.txt'), size: 2, lastModified: expect.any(Date) }])
    expect(listing.directories).toEqual([{ bucket, name: objectName('d/sub/') }])
  })

  // GF21
  it.fails('STO-9: pages a listing with limit and startAfter', async () => {
    for (const name of ['p/1', 'p/2', 'p/3']) await upload(name, name)
    const firstPage = await storage.listDirectory(ref('p/'), { limit: 2 })
    expect(firstPage.files.map(file => file.name)).toEqual([objectName('p/1'), objectName('p/2')])
    const nextPage = await storage.listDirectory(ref('p/'), { startAfter: objectName('p/2') })
    expect(nextPage.files.map(file => file.name)).toEqual([objectName('p/3')])
  })

  it("STO-10: creates a directory that its parent's listing shows", async () => {
    await storage.createDirectory(ref('e'))
    expect(await exists('e/.folderPlaceholder')).toBe(true)
    const listing = await storage.listDirectory(ref(''))
    expect(listing.directories).toContainEqual({ bucket, name: objectName('e/') })
  })

  it('STO-11: deletes every object under a directory, at every depth, and nothing beside it', async () => {
    for (const name of ['f/1', 'f/g/2', 'f/g/h/3', 'fx/4']) await upload(name, name)
    await storage.deleteDirectory(ref('f/'))
    for (const name of ['f/1', 'f/g/2', 'f/g/h/3']) expect(await exists(name)).toBe(false)
    expect(await exists('fx/4')).toBe(true)
  })

  it('STO-12: moves every object under a directory, at every depth', async () => {
    await upload('m/1', 'one')
    await upload('m/n/2', 'two')
    await storage.moveDirectory(ref('m/'), objectName('moved/'))
    expect(await content('moved/1')).toBe('one')
    expect(await content('moved/n/2')).toBe('two')
    const [remaining] = await sdkBucket().getFiles({ prefix: objectName('m/') })
    expect(remaining).toEqual([])
  })
})
