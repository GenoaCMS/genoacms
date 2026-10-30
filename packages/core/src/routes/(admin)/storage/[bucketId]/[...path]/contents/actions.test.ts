import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Grant } from '#lib/script/authorization/grants.js'
import type { Permission } from '#lib/script/authorization/permissions.js'

const service = vi.hoisted(() => ({
  uploadObject: vi.fn(),
  moveObject: vi.fn(),
  deleteObject: vi.fn(),
  listDirectory: vi.fn(),
  createDirectory: vi.fn(),
  moveDirectory: vi.fn(),
  deleteDirectory: vi.fn(),
  processDirectoryContents: vi.fn()
}))

vi.mock('#lib/script/storage/storage.server.js', () => ({
  defaultBucketId: 'media',
  getBucketReferences: () => [{ name: 'media' }],
  ...service
}))
vi.mock('#lib/script/host.server.js', () => ({ host: { defaultBucket: 'media', pathDelimiter: '|->' } }))

const { createAuthContext } = await import('#lib/script/authorization/context.js')
const { actions, load } = await import('./+page.server')

const grant = (permission: Permission): Grant => ({ permission, resource: { scope: 'bucket', id: 'media' } } as Grant)
const administrator = createAuthContext('subject-1', [{ permission: '*', resource: '*' } as Grant])
const reader = createAuthContext('subject-2', [grant('storage:bucket:read')])

type Action = (event: unknown) => Promise<unknown>

function formWith (fields: Record<string, string | File[]>): FormData {
  const body = new FormData()
  for (const [name, value] of Object.entries(fields)) {
    if (typeof value === 'string') body.set(name, value)
    else for (const file of value) body.append(name, file)
  }
  return body
}

async function submit (action: string, fields: Record<string, string | File[]>, options: { path?: string, auth?: unknown } = {}): Promise<unknown> {
  const event = {
    params: { bucketId: 'media', path: options.path ?? '|->photos/' },
    request: new Request(`http://localhost/storage/media/contents?/${action}`, { method: 'POST', body: formWith(fields) }),
    url: new URL(`http://localhost/storage/media/contents?/${action}`),
    locals: { auth: options.auth ?? administrator }
  }
  return await (actions as unknown as Record<string, Action>)[action](event)
}

const contents = (...names: string[]): string => JSON.stringify(names.map(name => ({ bucket: 'media', name })))
const everyServiceCall = (): unknown[][] => Object.values(service).flatMap(mock => mock.mock.calls)

beforeEach(() => {
  vi.clearAllMocks()
  for (const mock of Object.values(service)) mock.mockReset()
  for (const name of ['uploadObject', 'moveObject', 'deleteObject', 'createDirectory', 'moveDirectory', 'deleteDirectory'] as const) service[name].mockResolvedValue(undefined)
  service.listDirectory.mockResolvedValue({ files: [], directories: [] })
  service.processDirectoryContents.mockResolvedValue({ files: [], directories: [] })
})

describe('the storage browser actions', () => {
  it('BRW-7, BRW-13: a directory is created as the directory, the name and /', async () => {
    await submit('createDirectory', { directoryName: 'x' })

    expect(service.createDirectory.mock.calls).toEqual([[{ bucket: 'media', name: 'photos/x/' }]])
  })

  it('BRW-8: renaming a directory moves it and nothing beside it', async () => {
    await submit('rename', { name: '2024/', newName: '2025' })

    expect(service.moveDirectory.mock.calls).toEqual([[{ bucket: 'media', name: 'photos/2024/' }, 'photos/2025/']])
    expect(service.moveObject).not.toHaveBeenCalled()
  })

  it('BRW-9: an item already in the directory shown is left, and a directory is not moved below itself', async () => {
    await submit('move', { contents: contents('photos/a', 'photos/d/') })
    expect(service.moveObject).not.toHaveBeenCalled()
    expect(service.moveDirectory).not.toHaveBeenCalled()

    const result = await submit('move', { contents: contents('photos/d/') }, { path: '|->photos/|->d/|->x/' })
    expect(result).toMatchObject({ status: 500, data: { failed: ['photos/d/'] } })
  })

  it('BRW-11, BRW-13: malformed submissions fail with 400 and touch nothing', async () => {
    const rejected: Array<[string, Record<string, string | File[]>, string]> = [
      ['createDirectory', {}, 'missing-directory-name'],
      ['move', {}, 'missing-file-name'],
      ['rename', { newName: 'b' }, 'missing-name'],
      ['rename', { name: 'a' }, 'missing-new-name'],
      ['delete', {}, 'missing-contents'],
      ['move', { contents: 'x' }, 'invalid-contents'],
      ['move', { contents: '[]' }, 'invalid-contents'],
      ['move', { contents: '[{"bucket":"media"}]' }, 'invalid-contents'],
      ['delete', { contents: 'x' }, 'invalid-contents'],
      ['delete', { contents: '[]' }, 'invalid-contents'],
      ['delete', { contents: '[1]' }, 'invalid-contents'],
      ['createDirectory', { directoryName: 'a/b' }, 'invalid-name'],
      ['createDirectory', { directoryName: '..' }, 'invalid-name'],
      ['rename', { name: 'a', newName: 'b/c' }, 'invalid-name'],
      ['rename', { name: 'a', newName: '..' }, 'invalid-name'],
      ['uploadObject', { files: [new File(['x'], 'a/b')] }, 'invalid-name']
    ]
    for (const [action, fields, reason] of rejected) {
      expect(await submit(action, fields), `${action} ${reason}`).toMatchObject({ status: 400, data: { reason } })
    }
    expect(everyServiceCall()).toEqual([])
  })

  it('BRW-14: several items run one at a time and the failures are reported', async () => {
    const names = ['photos/a', 'photos/b', 'photos/c', 'photos/d', 'photos/e']
    const failing = new Set(['photos/b', 'photos/d'])
    const state = { inFlight: 0, maxInFlight: 0, order: [] as string[] }
    service.deleteObject.mockImplementation(async (reference: { name: string }) => {
      state.order.push(reference.name)
      state.inFlight++
      state.maxInFlight = Math.max(state.maxInFlight, state.inFlight)
      await new Promise(resolve => setTimeout(resolve, 2))
      state.inFlight--
      if (failing.has(reference.name)) throw new Error(`cannot delete ${reference.name}`)
    })

    const result = await submit('delete', { contents: contents(...names) })

    expect(state.order).toEqual(names)
    expect(state.maxInFlight).toBe(1)
    expect(result).toMatchObject({ status: 500, data: { done: 3, failed: ['photos/b', 'photos/d'] } })
  })

  it('BRW-16: a denial of any item is 403 and acts on nothing', async () => {
    const internal = await submit('delete', { contents: contents('photos/a', '.genoacms/x') })
    expect(internal).toMatchObject({ status: 403, data: { reason: 'internal-read-only' } })
    expect(everyServiceCall()).toEqual([])

    const denied = await submit('delete', { contents: contents('photos/a', 'photos/b') }, { auth: reader })
    expect(denied).toMatchObject({ status: 403, data: { reason: 'permission-denied' } })
    expect(everyServiceCall()).toEqual([])
  })

  it('BRW-16: a listing the principal may not read is 403', async () => {
    const event = {
      params: { bucketId: 'media', path: '|->photos/' },
      url: new URL('http://localhost/storage/media/|->photos//contents'),
      locals: { auth: createAuthContext('subject-3', []) }
    }

    await expect((load as unknown as Action)(event)).rejects.toMatchObject({ status: 403 })
    expect(everyServiceCall()).toEqual([])
  })
})
