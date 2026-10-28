import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Permission } from '$lib/script/authorization/permissions'
import { memory, memoryProviders } from '$lib/script/testing/memoryStorage'
import { callTool, useTool } from '$lib/script/testing/mcp'
import { principal, type Parsed } from '$lib/script/testing/requests'

vi.mock('$lib/script/storage/providers.server', async () => (await import('$lib/script/testing/memoryStorage')).memoryProviders)

const bucket = memory.bucket
const agent = principal(['storage:bucket:read', 'storage:bucket:write', 'storage:bucket:delete'], 'agent:editor')

const MAX_BYTES = 4_194_304
const NOW = Date.UTC(2026, 9, 28, 12, 0, 0)
const ONE_HOUR_MS = 3_600_000

const uploadedPayloads = (spy: { mock: { calls: Parsed[][] } }): Buffer[] => spy.mock.calls.map(call => call[1] as Buffer)

beforeEach(() => {
  memory.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('storage tools', () => {
  it.fails('TOL-24: buckets are listed, and a directory is listed one page at a time without URLs', async () => {
    memory.set('a/1.txt', 'x')
    memory.set('a/2.txt', 'yy')
    memory.set('a/b/3.txt', 'zzz')

    expect(await useTool(agent, 'list_buckets', {})).toContainEqual({ name: bucket })
    const listing = await useTool(agent, 'list_directory', { bucket, path: 'a/' })

    expect(listing.files).toEqual([
      { name: 'a/1.txt', size: 1, lastModified: expect.any(String) },
      { name: 'a/2.txt', size: 2, lastModified: expect.any(String) }
    ])
    for (const file of listing.files) expect(new Date(file.lastModified).toISOString()).toBe(file.lastModified)
    expect(JSON.stringify(listing)).not.toContain('signedURL')
    expect(listing.directories).toEqual(['a/b/'])
  })

  it.fails('TOL-25: an object is read through a signed URL that expires in an hour', async () => {
    memory.set('a/1.txt', 'x')
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(NOW)

    const read = await useTool(agent, 'get_object', { bucket, name: 'a/1.txt' })

    expect(read).toEqual({
      url: await memoryProviders.getSignedURL({ bucket, name: 'a/1.txt' }),
      expiresAt: new Date(NOW + ONE_HOUR_MS).toISOString()
    })
  })

  it.fails('TOL-26: text and base64 contents are stored as bytes', async () => {
    const uploads = vi.spyOn(memoryProviders, 'uploadObject')

    expect(await useTool(agent, 'upload_object', { bucket, name: 'u/text.txt', content: 'Návod 😀' })).toEqual({ name: 'u/text.txt' })
    expect(await useTool(agent, 'upload_object', { bucket, name: 'u/bytes', content: Buffer.from([0x00, 0xff]).toString('base64'), encoding: 'base64' })).toEqual({ name: 'u/bytes' })

    const [text, bytes] = uploadedPayloads(uploads)
    expect(text.equals(Buffer.from('Návod 😀', 'utf8'))).toBe(true)
    expect(bytes.equals(Buffer.from([0x00, 0xff]))).toBe(true)
    expect(memory.text('u/text.txt')).toBe('Návod 😀')
    expect(memory.has('u/bytes')).toBe(true)
  })

  it.fails('TOL-26: an existing object is replaced only with overwrite', async () => {
    memory.set('a/1.txt', 'old')

    expect(await callTool(agent, 'upload_object', { bucket, name: 'a/1.txt', content: 'new' }))
      .toMatchObject({ isError: true, text: `storage/exists: ${bucket}/a/1.txt` })
    expect(memory.text('a/1.txt')).toBe('old')

    expect(await useTool(agent, 'upload_object', { bucket, name: 'a/1.txt', content: 'new', overwrite: true })).toEqual({ name: 'a/1.txt' })
    expect(memory.text('a/1.txt')).toBe('new')
  })

  it.fails('TOL-26: oversized and malformed contents are refused and nothing is written', async () => {
    expect(await callTool(agent, 'upload_object', { bucket, name: 'u/big.txt', content: 'a'.repeat(MAX_BYTES + 1) }))
      .toMatchObject({ isError: true, text: 'storage/too-large: 4194305 bytes exceed 4194304' })
    expect(await callTool(agent, 'upload_object', { bucket, name: 'u/bad', content: 'no t', encoding: 'base64' }))
      .toMatchObject({ isError: true, text: 'storage/invalid-content: u/bad is not base64' })
    expect(memory.names()).toEqual([])
  })

  it.fails('TOL-27: an object is moved and deleted, and a missing one fails as not found', async () => {
    memory.set('a/1.txt', 'x')

    expect(await useTool(agent, 'move_object', { bucket, name: 'a/1.txt', destination: 'c/1.txt' })).toEqual({})
    expect(memory.names()).toEqual(['c/1.txt'])
    expect(await useTool(agent, 'delete_object', { bucket, name: 'c/1.txt' })).toEqual({})
    expect(await callTool(agent, 'delete_object', { bucket, name: 'c/1.txt' }))
      .toMatchObject({ isError: true, text: `storage/not-found: ${bucket}/c/1.txt` })
  })

  it.fails('TOL-28: directories are created, moved and deleted recursively', async () => {
    memory.set('a/1.txt', 'x')
    memory.set('a/b/3.txt', 'z')
    const remaining = (prefix: string): string[] => memory.names().filter(name => name.startsWith(prefix))

    expect(await useTool(agent, 'create_directory', { bucket, path: 'd/' })).toEqual({})
    expect(await useTool(agent, 'move_directory', { bucket, path: 'a/', destination: 'e/' })).toEqual({})
    expect(remaining('a/')).toEqual([])
    expect(remaining('e/')).toEqual(['e/1.txt', 'e/b/3.txt'])
    expect(await useTool(agent, 'delete_directory', { bucket, path: 'e/' })).toEqual({})
    expect(remaining('e/')).toEqual([])
  })

  it.fails('TOL-28: the root cannot be moved or deleted', async () => {
    memory.set('a/1.txt', 'x')
    const before = memory.snapshot()

    expect(await callTool(agent, 'move_directory', { bucket, path: '', destination: 'e/' }))
      .toMatchObject({ isError: true, text: 'storage/invalid-name: ' })
    expect(await callTool(agent, 'delete_directory', { bucket, path: '' }))
      .toMatchObject({ isError: true, text: 'storage/invalid-name: ' })
    expect(memory.snapshot()).toEqual(before)
  })

  it.fails('TOL-24 to TOL-28: changes under .genoacms are refused as STS-5 says', async () => {
    memory.set('.genoacms/x', 'state')
    const before = memory.snapshot()

    expect(await callTool(agent, 'upload_object', { bucket, name: '.genoacms/x', content: 'y' }))
      .toMatchObject({ isError: true, text: 'storage/internal-read-only: .genoacms/x' })
    expect(await callTool(agent, 'delete_directory', { bucket, path: '.genoacms/' }))
      .toMatchObject({ isError: true, text: 'storage/internal-read-only: .genoacms/' })
    expect(memory.snapshot()).toEqual(before)
  })

  it.fails('TOL-29: each storage tool demands its permission', async () => {
    memory.set('a/1.txt', 'x')
    const before = memory.snapshot()
    const demands: Array<[string, Record<string, unknown>, Permission]> = [
      ['list_directory', { bucket, path: 'a/' }, 'storage:bucket:read'],
      ['get_object', { bucket, name: 'a/1.txt' }, 'storage:bucket:read'],
      ['upload_object', { bucket, name: 'u.txt', content: 'x' }, 'storage:bucket:write'],
      ['move_object', { bucket, name: 'a/1.txt', destination: 'b/1.txt' }, 'storage:bucket:write'],
      ['create_directory', { bucket, path: 'd/' }, 'storage:bucket:write'],
      ['move_directory', { bucket, path: 'a/', destination: 'e/' }, 'storage:bucket:write'],
      ['delete_object', { bucket, name: 'a/1.txt' }, 'storage:bucket:delete'],
      ['delete_directory', { bucket, path: 'a/' }, 'storage:bucket:delete']
    ]
    const everyPermission: Permission[] = ['storage:bucket:read', 'storage:bucket:write', 'storage:bucket:delete']

    for (const [tool, args, required] of demands) {
      const lacking = principal(everyPermission.filter(permission => permission !== required), 'agent:editor')
      expect(await callTool(lacking, tool, args), tool)
        .toMatchObject({ isError: true, text: expect.stringMatching(/^permission-denied:/) })
      expect(memory.snapshot(), tool).toEqual(before)
    }
    expect(await useTool(principal([], 'agent:nobody'), 'list_buckets', {})).toEqual([])
  })
})
