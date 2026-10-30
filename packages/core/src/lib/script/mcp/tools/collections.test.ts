import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { Grant } from '#lib/script/authorization/grants.js'
import type { Permission } from '#lib/script/authorization/permissions.js'
import { createAuthContext } from '#lib/script/authorization/context.js'
import { memory } from '#lib/script/testing/memoryStorage.js'
import { memoryDatabase } from '#lib/script/testing/memoryDatabase.js'
import { callTool, useTool } from '#lib/script/testing/mcp.js'
import { principal, type Parsed } from '#lib/script/testing/requests.js'
import { collections } from '../../../../../genoa.config/collections'

vi.mock('#lib/script/storage/providers.server.js', async () => (await import('#lib/script/testing/memoryStorage.js')).memoryProviders)
vi.mock('#lib/script/database/providers.server.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('#lib/script/database/providers.server.js')>(),
  ...(await import('#lib/script/testing/memoryDatabase.js')).memoryDatabaseProviders
}))

const definition = collections.find(collection => collection.name === 'test') as NonNullable<typeof collections[number]>

const reader = principal(['db:collection:read'], 'agent:editor')
const writer = principal(['db:collection:read', 'db:collection:write'], 'agent:editor')
const remover = principal(['db:collection:read', 'db:collection:delete'], 'agent:editor')

const onTest = (permission: Permission, fields?: string[]): Grant =>
  ({ permission, resource: { scope: 'collection', id: 'test' }, ...(fields === undefined ? {} : { fields }) } as Grant)
const restrictedReader = createAuthContext('agent:editor', [onTest('db:collection:read', ['name'])])

const idOf = (index: number): string => `d${String(index).padStart(3, '0')}`
const idsOf = (page: Parsed): string[] => page.documents.map((document: { id: string }) => document.id)
const snapshot = (): Array<[string, unknown]> => memoryDatabase.ids('test').map(id => [id, memoryDatabase.get('test', id)])

beforeEach(() => {
  memory.clear()
  memoryDatabase.clear()
})

afterEach(() => { vi.restoreAllMocks() })

describe('collection tools', () => {
  it('TOL-18: collections are listed from the catalog, and one is read with its schema', async () => {
    const agent = createAuthContext('agent:editor', [onTest('db:collection:read')])

    expect(await useTool(agent, 'list_collections', {})).toEqual([{ name: 'test' }])
    expect(await useTool(agent, 'get_collection', { collection: 'test' }))
      .toEqual({ name: definition.name, primaryKey: definition.primaryKey, schema: definition.schema })
  })

  it('TOL-18: an unknown collection fails as not found', async () => {
    expect(await callTool(reader, 'get_collection', { collection: 'absent' }))
      .toMatchObject({ isError: true, text: 'collection/not-found: absent' })
  })

  it('TOL-19: documents are listed a page at a time, filtered by conditions', async () => {
    for (let index = 0; index < 120; index++) memoryDatabase.set('test', idOf(index), { name: `n${index}`, isA: index % 4 === 0 })

    const first = await useTool(reader, 'list_documents', { collection: 'test' })
    const second = await useTool(reader, 'list_documents', { collection: 'test', pageToken: first.next })
    const third = await useTool(reader, 'list_documents', { collection: 'test', pageToken: second.next })
    expect([first, second, third].map(page => page.documents.length)).toEqual([50, 50, 20])
    expect(third.next).toBeUndefined()
    expect(Object.hasOwn(third, 'next')).toBe(false)
    expect([...idsOf(first), ...idsOf(second), ...idsOf(third)].sort()).toEqual(Array.from({ length: 120 }, (_, index) => idOf(index)))

    const where = [{ field: 'isA', operator: '==', value: true }]
    const matching = await useTool(reader, 'list_documents', { collection: 'test', where, limit: 20 })
    const rest = await useTool(reader, 'list_documents', { collection: 'test', where, limit: 20, pageToken: matching.next })
    expect([matching, rest].map(page => page.documents.length)).toEqual([20, 10])
    expect(rest.next).toBeUndefined()
    const listed = [...matching.documents, ...rest.documents]
    expect(listed.every((document: { data: { isA: boolean } }) => document.data.isA)).toBe(true)
    expect(new Set(idsOf({ documents: listed })).size).toBe(30)
  })

  it('TOL-19: a limit outside 1 to 200 is refused', async () => {
    for (const limit of [0, 201]) {
      expect(await callTool(reader, 'list_documents', { collection: 'test', limit }), String(limit))
        .toMatchObject({ isError: true, text: expect.stringMatching(/^tools\/invalid-arguments: /) })
    }
  })

  it('TOL-19: a condition on a field the agent may not read is refused', async () => {
    memoryDatabase.set('test', 'd', { name: 'a', isA: true })
    const queried = vi.spyOn(memoryDatabase, 'getCollection')

    const outcome = await callTool(restrictedReader, 'list_documents', { collection: 'test', where: [{ field: 'isA', operator: '==', value: true }] })

    expect(outcome).toMatchObject({ isError: true, text: 'documents/unreadable-field: isA' })
    expect(queried).not.toHaveBeenCalled()
  })

  it('TOL-19, TOL-20: only readable fields are returned', async () => {
    memoryDatabase.set('test', 'd', { name: 'a', isA: true })

    const page = await useTool(restrictedReader, 'list_documents', { collection: 'test' })
    expect(page.documents).toEqual([{ id: 'd', data: { name: 'a' } }])
    expect(await useTool(restrictedReader, 'get_document', { collection: 'test', id: 'd' })).toEqual({ id: 'd', data: { name: 'a' } })
  })

  it('TOL-20: a missing document fails as not found', async () => {
    expect(await callTool(reader, 'get_document', { collection: 'test', id: 'x' }))
      .toMatchObject({ isError: true, text: 'documents/not-found: test/x' })
  })

  it('TOL-21: a document is created, validated, and its id returned', async () => {
    const created = await useTool(writer, 'create_document', { collection: 'test', data: { name: 'a', isA: true } })
    expect(memoryDatabase.get('test', created.id)).toEqual({ name: 'a', isA: true })

    expect(await callTool(writer, 'create_document', { collection: 'test', data: { isA: 'yes' } }))
      .toMatchObject({ isError: true, text: 'documents/invalid: /isA type' })
    expect(memoryDatabase.ids('test')).toEqual([created.id])
  })

  it('TOL-22: an update sets only the given fields and the later save wins', async () => {
    memoryDatabase.set('test', 'd', { name: 'a', isA: true })

    expect(await useTool(writer, 'update_document', { collection: 'test', id: 'd', data: { name: 'b' } })).toEqual({ id: 'd' })
    expect(await useTool(writer, 'update_document', { collection: 'test', id: 'd', data: { name: 'c' } })).toEqual({ id: 'd' })
    expect(memoryDatabase.get('test', 'd')).toEqual({ name: 'c', isA: true })
  })

  it('TOL-22: an update of a missing document fails and writes nothing', async () => {
    expect(await callTool(writer, 'update_document', { collection: 'test', id: 'x', data: { name: 'b' } }))
      .toMatchObject({ isError: true, text: 'documents/not-found: test/x' })
    expect(memoryDatabase.get('test', 'x')).toBeUndefined()
  })

  it('TOL-23: a document is deleted, and a missing one is not an error', async () => {
    memoryDatabase.set('test', 'd', { name: 'a' })

    expect(await useTool(remover, 'delete_document', { collection: 'test', id: 'd' })).toEqual({})
    expect(await useTool(remover, 'delete_document', { collection: 'test', id: 'd' })).toEqual({})
    expect(memoryDatabase.get('test', 'd')).toBeUndefined()
  })

  it('TOL-29: each collection tool demands its permission', async () => {
    memoryDatabase.set('test', 'd', { name: 'a' })
    const demands: Array<[string, Record<string, unknown>, Permission[]]> = [
      ['get_collection', { collection: 'test' }, ['db:collection:read']],
      ['list_documents', { collection: 'test' }, ['db:collection:read']],
      ['get_document', { collection: 'test', id: 'd' }, ['db:collection:read']],
      ['create_document', { collection: 'test', data: { name: 'n' } }, ['db:collection:read', 'db:collection:write']],
      ['update_document', { collection: 'test', id: 'd', data: { name: 'n' } }, ['db:collection:read', 'db:collection:write']],
      ['delete_document', { collection: 'test', id: 'd' }, ['db:collection:read', 'db:collection:delete']]
    ]
    const before = snapshot()

    for (const [tool, args, required] of demands) {
      for (const lacking of required) {
        const agent = principal(required.filter(permission => permission !== lacking), 'agent:editor')
        expect(await callTool(agent, tool, args), `${tool} without ${lacking}`)
          .toMatchObject({ isError: true, text: expect.stringMatching(/^permission-denied:/) })
        expect(snapshot(), `${tool} without ${lacking}`).toEqual(before)
      }
    }
    expect(await useTool(principal([], 'agent:nobody'), 'list_collections', {})).toEqual([])
  })
})
