import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import type { Adapter, CollectionReference } from '@genoacms/contracts/database'
import runtime from '../../src/database/runtime.js'
import { enabled, region, tableName, createRunTable, deleteRunTable } from './aws.js'

const ONE_MINUTE = 60_000
const TABLE_TIMEOUT = 6 * ONE_MINUTE
const FIFTY_KB = 50 * 1024

const collection = { name: tableName, primaryKey: { key: 'id', schema: { type: 'string' } }, schema: { type: 'object' } } as unknown as CollectionReference
const reference = (id: string) => ({ collection, id })

const everyJsonValue = {
  text: 'a',
  integer: 42,
  fraction: 0.5,
  flag: true,
  nothing: null,
  list: [1, ['x', false]],
  object: { nested: { n: -3, s: 'y' } }
}

let database: Adapter

describe.runIf(enabled)('DynamoDB, against the real service', { timeout: ONE_MINUTE }, () => {
  beforeAll(async () => {
    await createRunTable()
    database = await runtime.create({ region }, { name: 'contract', resources: [] })
  }, TABLE_TIMEOUT)

  afterAll(async () => {
    await deleteRunTable()
  }, TABLE_TIMEOUT)

  it('DDB-2, DDB-3, DDB-4, DDB-6: creates a document and reads back every JSON value', async () => {
    const created = await database.createDocument(collection, everyJsonValue as any)
    const read = await database.getDocument(reference(created.reference.id))
    expect(read?.data).toEqual(everyJsonValue)
    expect(read?.data).not.toHaveProperty('id')
  })

  it('DDB-4: never overwrites a document', async () => {
    const first = await database.createDocument(collection, { t: 'first' } as any)
    const id = first.reference.id
    const second = await database.createDocument(collection, { id, t: 'second' } as any)
    expect(second.reference.id).not.toBe(id)
    expect((await database.getDocument(reference(id)))?.data).toEqual({ t: 'first' })
  })

  it('DDB-5: reads a collection across pages', async () => {
    const ids: string[] = []
    for (let index = 0; index < 30; index++) {
      const created = await database.createDocument(collection, { index, body: 'x'.repeat(FIFTY_KB) } as any)
      ids.push(created.reference.id)
    }
    const snapshots = await database.getCollection(collection)
    expect(snapshots.map(snapshot => snapshot.reference.id)).toEqual(expect.arrayContaining(ids))
  }, 5 * ONE_MINUTE)

  it('DDB-6: resolves undefined for a missing document', async () => {
    expect(await database.getDocument(reference(randomUUID()))).toBeUndefined()
  })

  it('DDB-7: merges an update, and fails on a missing document', async () => {
    const created = await database.createDocument(collection, { a: 1, b: 2 } as any)
    await database.updateDocument(reference(created.reference.id), { b: 3 } as any)
    expect((await database.getDocument(reference(created.reference.id)))?.data).toEqual({ a: 1, b: 3 })
    await expect(database.updateDocument(reference(randomUUID()), { b: 3 } as any)).rejects.toMatchObject({ name: 'ConditionalCheckFailedException' })
  })

  it('DDB-7: deletes, and deleting again is not an error', async () => {
    const created = await database.createDocument(collection, { t: 'deleted' } as any)
    await database.deleteDocument(reference(created.reference.id))
    expect(await database.getDocument(reference(created.reference.id))).toBeUndefined()
    await expect(database.deleteDocument(reference(created.reference.id))).resolves.toBeUndefined()
  })
})
