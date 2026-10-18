import { describe, it, expect, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { Readable } from 'node:stream'
import * as contract from '@genoacms/contracts/storage'

const ADAPTER_METHODS = [
  'getObject', 'getSignedURL', 'getPublicURL', 'uploadObject', 'moveObject',
  'deleteObject', 'listDirectory', 'createDirectory', 'deleteDirectory', 'moveDirectory'
]
const ONE_MINUTE = 60_000

async function readAll (stream) {
  const chunks = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks)
}

async function rejection (promise) {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('expected a rejection, but the call resolved')
}

const namesOf = (listing) => ({
  files: listing.files.map(file => file.name),
  directories: listing.directories.map(directory => directory.name)
})

/**
 * @param {import('@genoacms/contracts/storage').Adapter} adapter
 * @param {{ bucket: string }} fixture
 */
function runStorageConformance (adapter, fixture) {
  const { bucket } = fixture
  const d = `genoacms-conformance-${randomUUID()}/`
  const ref = (name) => ({ bucket, name: `${d}${name}` })
  const upload = async (name, data, options = {}) => await adapter.uploadObject(ref(name), data, options)
  const content = async (name) => (await readAll((await adapter.getObject(ref(name))).data)).toString('utf8')
  const list = async (name, params) => await adapter.listDirectory(ref(name), params)

  describe('storage conformance', { timeout: ONE_MINUTE }, () => {
    afterAll(async () => {
      await adapter.deleteDirectory({ bucket, name: d })
    }, 2 * ONE_MINUTE)

    it('STOR-2: the adapter has the ten methods', () => {
      for (const method of ADAPTER_METHODS) expect(adapter[method], method).toBeTypeOf('function')
    })

    it('STOR-4: a bucket the provider was not given is refused', async () => {
      const unregistered = { bucket: `${bucket}-unregistered`, name: `${d}x` }
      const calls = [
        async () => await adapter.getObject(unregistered),
        async () => await adapter.uploadObject(unregistered, 'x', {}),
        async () => await adapter.listDirectory({ ...unregistered, name: d })
      ]
      for (const call of calls) expect(await rejection(call())).toMatchObject({ message: 'bucket-unregistered' })
    })

    it('STOR-5, STOR-7, STOR-11: an uploaded object is listed with its size and read back byte for byte', async () => {
      const binary = Buffer.from(Array.from({ length: 300 }, (_, index) => index % 256))
      expect(await upload('a.txt', 'Storage adapter ✓')).toBeUndefined()
      expect(await upload('b.bin', binary)).toBeUndefined()
      const { files } = await list('')
      expect(files).toContainEqual({ name: `${d}a.txt`, size: 19, lastModified: expect.any(Date) })
      expect(files).toContainEqual({ name: `${d}b.bin`, size: 300, lastModified: expect.any(Date) })
      expect((await readAll((await adapter.getObject(ref('a.txt'))).data)).equals(Buffer.from('Storage adapter ✓'))).toBe(true)
      expect((await readAll((await adapter.getObject(ref('b.bin'))).data)).equals(binary)).toBe(true)
    })

    it('STOR-7: a stream is written whole', async () => {
      const chunks = [Buffer.from('one '), Buffer.from('two '), Buffer.from('three')]
      await upload('s.txt', Readable.from(chunks), {})
      expect(await content('s.txt')).toBe('one two three')
    })

    it('STOR-5, STOR-6, STOR-7: a write on the version read succeeds, and the old version is refused', async () => {
      await upload('v.txt', 'one')
      const { data, version: v1 } = await adapter.getObject(ref('v.txt'))
      await readAll(data)
      expect(v1).toEqual(expect.any(String))
      await upload('v.txt', 'two', { ifVersion: v1 })
      const { data: reread, version: v2 } = await adapter.getObject(ref('v.txt'))
      await readAll(reread)
      expect(v2).not.toBe(v1)
      const refused = await rejection(upload('v.txt', 'three', { ifVersion: v1 }))
      expect(contract.isPreconditionFailed(refused)).toBe(true)
      expect(refused.reason).toBe('object changed since it was read')
      expect(await content('v.txt')).toBe('two')
    })

    it('STOR-7, STOR-8: ifAbsent creates once, and refuses an existing object', async () => {
      await upload('n.txt', 'first', { ifAbsent: true })
      const refused = await rejection(upload('n.txt', 'second', { ifAbsent: true }))
      expect(refused.message).toBe(`storage/precondition-failed: ${bucket}/${d}n.txt: object already exists`)
      expect(await content('n.txt')).toBe('first')
      await upload('n2.txt', 'created', { ifAbsent: true, ifVersion: 'stale' })
      expect(await content('n2.txt')).toBe('created')
    })

    it('STOR-6: every write gives the object a new version', async () => {
      const versionRead = async () => {
        const { data, version } = await adapter.getObject(ref('w.txt'))
        await readAll(data)
        return version
      }
      await upload('w.txt', 'one')
      const first = await versionRead()
      await upload('w.txt', 'two')
      const second = await versionRead()
      await upload('w.txt', 'three', { ifVersion: second })
      const third = await versionRead()
      expect(new Set([first, second, third]).size).toBe(3)
    })

    it('STOR-7: of racing ifAbsent writes exactly one succeeds', async () => {
      const outcomes = await Promise.allSettled(Array.from({ length: 5 }, (_, index) => upload('race.txt', `writer-${index}`, { ifAbsent: true })))
      const winners = outcomes.flatMap((outcome, index) => outcome.status === 'fulfilled' ? [index] : [])
      expect(winners).toHaveLength(1)
      for (const outcome of outcomes) {
        if (outcome.status === 'rejected') expect(contract.isPreconditionFailed(outcome.reason)).toBe(true)
      }
      expect(await content('race.txt')).toBe(`writer-${winners[0]}`)
    })

    it('STOR-7: a write without a condition replaces the object', async () => {
      await upload('r.txt', 'first')
      await upload('r.txt', 'second')
      expect(await content('r.txt')).toBe('second')
    })

    it('STOR-16: reading a missing object rejects with ObjectNotFoundError', async () => {
      const error = await rejection(adapter.getObject(ref('missing')))
      expect(contract.isNotFound(error)).toBe(true)
      expect(error.message).toBe(`storage/not-found: ${bucket}/${d}missing`)
    })

    it('STOR-16: deleting a missing object rejects with ObjectNotFoundError', async () => {
      const before = await list('')
      const error = await rejection(adapter.deleteObject(ref('missing')))
      expect(contract.isNotFound(error)).toBe(true)
      expect(error.message).toBe(`storage/not-found: ${bucket}/${d}missing`)
      expect(await list('')).toEqual(before)
    })

    it('STOR-10: a moved object is read under its new name and is gone from its old one', async () => {
      await upload('mv-old.txt', 'moving')
      await adapter.moveObject(ref('mv-old.txt'), `${d}mv-new.txt`)
      expect(await content('mv-new.txt')).toBe('moving')
      expect(contract.isNotFound(await rejection(adapter.getObject(ref('mv-old.txt'))))).toBe(true)
      expect(await adapter.deleteObject(ref('mv-new.txt'))).toBeUndefined()
      expect(contract.isNotFound(await rejection(adapter.getObject(ref('mv-new.txt'))))).toBe(true)
    })

    it('STOR-3: the directory methods refuse a name that is not a directory name', async () => {
      const refusals = [
        [async () => await adapter.listDirectory(ref('x')), `${d}x`],
        [async () => await adapter.createDirectory(ref('x')), `${d}x`],
        [async () => await adapter.deleteDirectory(ref('x')), `${d}x`],
        [async () => await adapter.moveDirectory(ref('x'), `${d}y/`), `${d}x`],
        [async () => await adapter.moveDirectory(ref('x/'), `${d}y`), `${d}y`],
        [async () => await adapter.createDirectory({ bucket, name: '' }), '']
      ]
      for (const [call, name] of refusals) {
        expect(await rejection(call())).toMatchObject({ message: `storage/not-a-directory: ${bucket}/${name}` })
      }
      const { files, directories } = namesOf(await list(''))
      expect(files).not.toContain(`${d}x`)
      expect(directories).not.toContain(`${d}x/`)
      expect(directories).not.toContain(`${d}y/`)
    })

    it('STOR-3: names are not normalized', async () => {
      const names = [['a//b.txt', 'a/b.txt'], ['./c.txt', 'c.txt'], ['a/../e.txt', 'e.txt']]
      for (const [name, normalized] of names) {
        const isRefused = await adapter.uploadObject(ref(name), name, {}).then(() => false, () => true)
        if (!isRefused) expect(await content(name), name).toBe(name)
        expect(contract.isNotFound(await rejection(adapter.getObject(ref(normalized)))), normalized).toBe(true)
      }
    })

    it('STOR-11, STOR-12: a created directory is listed in its parent while empty, and shows no file', async () => {
      await adapter.createDirectory(ref('e/'))
      const parent = await list('')
      expect(parent.directories).toContainEqual({ bucket, name: `${d}e/` })
      expect(parent.files.filter(file => file.name.startsWith(`${d}e/`))).toEqual([])
      expect(namesOf(await list('e/'))).toEqual({ files: [], directories: [] })
      await upload('e/f', 'x')
      await adapter.deleteObject(ref('e/f'))
      expect((await list('')).directories).toContainEqual({ bucket, name: `${d}e/` })
    })

    it('STOR-11: a listing is one level deep', async () => {
      await upload('l/1.txt', '1')
      await upload('l/sub/2.txt', '2')
      await upload('l/sub/deeper/3.txt', '3')
      const listing = await list('l/')
      expect(namesOf(listing)).toEqual({ files: [`${d}l/1.txt`], directories: [`${d}l/sub/`] })
      expect(listing.next).toBeUndefined()
    })

    it('STOR-11: pages list every entry exactly once', async () => {
      const files = Array.from({ length: 7 }, (_, index) => `${d}p/file-${index}`)
      const directories = Array.from({ length: 3 }, (_, index) => `${d}p/dir-${index}/`)
      for (const name of files) await adapter.uploadObject({ bucket, name }, name, {})
      for (const name of directories) await adapter.uploadObject({ bucket, name: `${name}x` }, name, {})
      const seen = []
      const pages = []
      let pageToken
      do {
        const page = await list('p/', pageToken === undefined ? { limit: 3 } : { limit: 3, pageToken })
        pages.push(page)
        seen.push(...page.files.map(file => file.name), ...page.directories.map(directory => directory.name))
        pageToken = page.next
      } while (pageToken !== undefined && pages.length < 20)
      for (const page of pages) expect(page.files.length + page.directories.length).toBeLessThanOrEqual(3)
      expect(pages.at(-1).next).toBeUndefined()
      for (const later of pages.slice(1)) expect(later.files.length + later.directories.length).toBeGreaterThan(0)
      expect(seen.sort()).toEqual([...files, ...directories].sort())
    })

    it('STOR-11: startAfter lists only what sorts after it', async () => {
      for (const name of ['a', 'b', 'c']) await upload(`s/${name}`, name)
      const listing = await list('s/', { startAfter: `${d}s/a` })
      expect(listing.files.map(file => file.name)).toEqual([`${d}s/b`, `${d}s/c`])
    })

    it('STOR-13: deleting a directory removes every object under it, and nothing beside it', async () => {
      await upload('r/1', 'one')
      await upload('r/x/2', 'two')
      await upload('r-sibling', 'sibling')
      await adapter.createDirectory(ref('r/y/'))
      await adapter.deleteDirectory(ref('r/'))
      expect(namesOf(await list('r/'))).toEqual({ files: [], directories: [] })
      expect(await content('r-sibling')).toBe('sibling')
    })

    it('STOR-14: moving a directory moves every object under it, names taken literally', async () => {
      await upload('m/1', 'one')
      await upload('m/x/2', 'two')
      await upload('m-sibling', 'sibling')
      await adapter.moveDirectory(ref('m/'), `${d}n$&/`)
      expect(await content('n$&/1')).toBe('one')
      expect(await content('n$&/x/2')).toBe('two')
      expect(namesOf(await list('m/'))).toEqual({ files: [], directories: [] })
      expect(await content('m-sibling')).toBe('sibling')
    })
  })
}

export { runStorageConformance }
