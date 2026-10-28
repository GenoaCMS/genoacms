import { describe, it, expect, vi, beforeEach } from 'vitest'
import runtime from './runtime.js'

const constructed: unknown[] = []
const doc = { get: vi.fn(), update: vi.fn(async () => {}), delete: vi.fn(async () => {}) }
const collection: Record<string, any> = { add: vi.fn(), get: vi.fn(), doc: vi.fn(() => doc), set: vi.fn() }
for (const chained of ['where', 'orderBy', 'limit', 'startAfter']) collection[chained] = vi.fn(() => collection)
const collectionCalls: string[] = []
vi.mock('@google-cloud/firestore', () => {
  class FieldPath {
    names: string[]
    constructor (...names: string[]) { this.names = names }
    static documentId (): FieldPath { return new FieldPath('__name__') }
  }
  return {
    FieldPath,
    Firestore: vi.fn(function (this: any, options: unknown) {
      constructed.push(options)
      this.collection = (name: string) => { collectionCalls.push(name); return collection }
    })
  }
})

beforeEach(() => { collectionCalls.length = 0; vi.clearAllMocks() })

const fieldName = (field: unknown): string => typeof field === 'string' ? field : (field as { names: string[] }).names.join('.')
const emptyResult = { docs: [], size: 0, empty: true, forEach: () => {} }

const pages = { name: 'pages' } as any
const create = async () => await runtime.create({ projectId: 'p' }, { name: 'db', resources: [] })

describe('the Firestore runtime', () => {
  it("COM-4, DB-2: defaults the database id to '(default)' and adds credentials only when given", async () => {
    constructed.length = 0
    await runtime.create({ projectId: 'p' }, { name: 'db', resources: [] })
    await runtime.create({ projectId: 'p', databaseId: 'other', credentials: { client_email: 'e' } as any }, { name: 'db', resources: [] })
    expect(constructed).toEqual([
      { projectId: 'p', databaseId: '(default)' },
      { projectId: 'p', databaseId: 'other', credentials: { client_email: 'e' } }
    ])
  })

  it('DB-3: addresses the collection by its name, unchanged', async () => {
    const database = await create()
    collection.add.mockResolvedValueOnce({ id: 'g1' })
    collection.get.mockResolvedValueOnce({ forEach: () => {} })
    doc.get.mockResolvedValueOnce({ exists: false })
    await database.createDocument(pages, {} as any)
    await database.getCollection(pages)
    await database.getDocument({ collection: pages, id: 'x' })
    await database.updateDocument({ collection: pages, id: 'x' }, {} as any)
    await database.deleteDocument({ collection: pages, id: 'x' })
    expect(collectionCalls).toEqual(['pages', 'pages', 'pages', 'pages', 'pages'])
  })

  it('DB-4: creates with a generated id and returns the input data', async () => {
    const database = await create()
    const data = { title: 't' } as any
    collection.add.mockResolvedValueOnce({ id: 'g1' })
    const snapshot = await database.createDocument(pages, data)
    expect(collection.add).toHaveBeenCalledWith(data)
    expect(snapshot).toEqual({ reference: { collection: pages, id: 'g1' }, data })
    expect(snapshot.data).toBe(data)
  })

  it('DB-5: reads a whole collection as snapshots', async () => {
    const database = await create()
    const documents = [{ id: 'a', data: () => ({ n: 1 }) }, { id: 'b', data: () => ({ n: 2 }) }]
    collection.get.mockResolvedValueOnce({ forEach: (visit: (d: unknown) => void) => { documents.forEach(visit) } })
    expect(await database.getCollection(pages)).toEqual([
      { reference: { collection: pages, id: 'a' }, data: { n: 1 } },
      { reference: { collection: pages, id: 'b' }, data: { n: 2 } }
    ])
  })

  it('DB-6: reads a document, or undefined when it does not exist', async () => {
    const database = await create()
    doc.get.mockResolvedValueOnce({ exists: true, data: () => ({ n: 1 }) })
    expect(await database.getDocument({ collection: pages, id: 'a' })).toEqual({ reference: { collection: pages, id: 'a' }, data: { n: 1 } })
    expect(collection.doc).toHaveBeenLastCalledWith('a')
    doc.get.mockResolvedValueOnce({ exists: false })
    expect(await database.getDocument({ collection: pages, id: 'z' })).toBeUndefined()
  })

  it('DB-7: updates with update and deletes with delete', async () => {
    const database = await create()
    const reference = { collection: pages, id: 'a' }
    const data = { n: 2 } as any
    expect(await database.updateDocument(reference, data)).toEqual({ reference, data })
    expect(doc.update).toHaveBeenCalledWith(data)
    await database.deleteDocument(reference)
    expect(doc.delete).toHaveBeenCalled()
    doc.update.mockRejectedValueOnce(new Error('NOT_FOUND: no document to update'))
    await expect(database.updateDocument(reference, data)).rejects.toThrow('NOT_FOUND: no document to update')
  })

  it.fails('DATA-9, DB-5: conditions become where clauses ordered by their inequality fields then the ID', async () => {
    const database = await create()
    collection.get.mockResolvedValueOnce(emptyResult)
    await database.getCollection(pages, {
      where: [{ field: 'b', operator: '<', value: 2 }, { field: 'a', operator: '==', value: 'x' }],
      limit: 3
    })
    const wheres = collection.where.mock.calls.map(([field, operator, value]: unknown[]) => [fieldName(field), operator, value])
    expect(wheres).toHaveLength(2)
    expect(wheres).toContainEqual(['b', '<', 2])
    expect(wheres).toContainEqual(['a', '==', 'x'])
    expect(collection.orderBy.mock.calls.map(([field]: unknown[]) => fieldName(field))).toEqual(['b', '__name__'])
    expect(collection.limit).toHaveBeenCalledWith(3)
  })

  it.fails('DATA-11, DB-5: a missing index becomes UnsupportedQueryError', async () => {
    const database = await create()
    const message = '9 FAILED_PRECONDITION: The query requires an index. You can create it here: https://console.firebase.google.com/index'
    collection.get.mockRejectedValueOnce(Object.assign(new Error(message), { code: 9 }))
    const failure = await database.getCollection(pages, { where: [{ field: 'a', operator: '==', value: 'x' }, { field: 'b', operator: '<', value: 2 }] }).catch((error: Error) => error)
    expect(failure).toMatchObject({ name: 'UnsupportedQueryError' })
    expect((failure as Error).message.startsWith('database/unsupported-query: ')).toBe(true)
    expect((failure as Error).message.endsWith(message)).toBe(true)
  })

  it.fails('DATA-6, DB-7: a missing document becomes DocumentNotFoundError', async () => {
    const database = await create()
    doc.update.mockRejectedValueOnce(Object.assign(new Error('5 NOT_FOUND: No document to update'), { code: 5 }))
    const failure = await database.updateDocument({ collection: pages, id: 'x' }, { n: 1 } as any).catch((error: Error) => error)
    expect(failure).toMatchObject({ name: 'DocumentNotFoundError', message: 'database/not-found: pages/x' })
  })
})
