import { describe, it, expect, vi, beforeEach } from 'vitest'
import runtime from './runtime.js'

const constructed: unknown[] = []
const doc = { get: vi.fn(), update: vi.fn(async () => {}), delete: vi.fn(async () => {}) }
const collection = { add: vi.fn(), get: vi.fn(), doc: vi.fn(() => doc) }
const collectionCalls: string[] = []
vi.mock('@google-cloud/firestore', () => ({
  Firestore: vi.fn(function (this: any, options: unknown) {
    constructed.push(options)
    this.collection = (name: string) => { collectionCalls.push(name); return collection }
  })
}))

beforeEach(() => { collectionCalls.length = 0; vi.clearAllMocks() })

const pages = { name: 'pages' } as any
const create = async () => await runtime.create({ projectId: 'p' }, { name: 'db', resources: [] })

describe('the Firestore runtime', () => {
  it("defaults the database id to '(default)' and adds credentials only when given", async () => {
    constructed.length = 0
    await runtime.create({ projectId: 'p' }, { name: 'db', resources: [] })
    await runtime.create({ projectId: 'p', databaseId: 'other', credentials: { client_email: 'e' } as any }, { name: 'db', resources: [] })
    expect(constructed).toEqual([
      { projectId: 'p', databaseId: '(default)' },
      { projectId: 'p', databaseId: 'other', credentials: { client_email: 'e' } }
    ])
  })

  it('addresses the collection by its name, unchanged', async () => {
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

  it('creates with a generated id and returns the input data', async () => {
    const database = await create()
    const data = { title: 't' } as any
    collection.add.mockResolvedValueOnce({ id: 'g1' })
    const snapshot = await database.createDocument(pages, data)
    expect(collection.add).toHaveBeenCalledWith(data)
    expect(snapshot).toEqual({ reference: { collection: pages, id: 'g1' }, data })
    expect(snapshot.data).toBe(data)
  })

  it('reads a whole collection as snapshots', async () => {
    const database = await create()
    const documents = [{ id: 'a', data: () => ({ n: 1 }) }, { id: 'b', data: () => ({ n: 2 }) }]
    collection.get.mockResolvedValueOnce({ forEach: (visit: (d: unknown) => void) => { documents.forEach(visit) } })
    expect(await database.getCollection(pages)).toEqual([
      { reference: { collection: pages, id: 'a' }, data: { n: 1 } },
      { reference: { collection: pages, id: 'b' }, data: { n: 2 } }
    ])
  })

  it('reads a document, or undefined when it does not exist', async () => {
    const database = await create()
    doc.get.mockResolvedValueOnce({ exists: true, data: () => ({ n: 1 }) })
    expect(await database.getDocument({ collection: pages, id: 'a' })).toEqual({ reference: { collection: pages, id: 'a' }, data: { n: 1 } })
    expect(collection.doc).toHaveBeenLastCalledWith('a')
    doc.get.mockResolvedValueOnce({ exists: false })
    expect(await database.getDocument({ collection: pages, id: 'z' })).toBeUndefined()
  })

  it('updates with update and deletes with delete', async () => {
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
})
