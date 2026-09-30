import { describe, it, beforeAll, afterAll } from 'vitest'
import { runStorageConformance, runDatabaseConformance } from '@genoacms/conformance'
import type { Adapter as StorageAdapter, ObjectReference } from '@genoacms/contracts/storage'
import type { CollectionReference, Document } from '@genoacms/contracts/database'
import storageRuntime from '../src/storage/runtime.js'
import databaseRuntime from '../src/database/runtime.js'
import { enabled, region, bucket, objectPrefix, tableName, createRunTable, deleteRunTable, deleteRunObjects } from './contract/aws.js'

const ONE_MINUTE = 60_000
const TABLE_TIMEOUT = 6 * ONE_MINUTE

function underPrefix (storage: StorageAdapter, prefix: string): StorageAdapter {
  const inside = (reference: ObjectReference): ObjectReference => ({ ...reference, name: `${prefix}${reference.name}` })
  const outside = (name: string): string => name.startsWith(prefix) ? name.slice(prefix.length) : name
  return {
    getObject: async reference => await storage.getObject(inside(reference)),
    getSignedURL: async (reference, expires) => await storage.getSignedURL(inside(reference), expires),
    getPublicURL: async reference => await storage.getPublicURL(inside(reference)),
    uploadObject: async (reference, data, options) => { await storage.uploadObject(inside(reference), data, options) },
    moveObject: async (reference, destination) => { await storage.moveObject(inside(reference), `${prefix}${destination}`) },
    deleteObject: async reference => { await storage.deleteObject(inside(reference)) },
    listDirectory: async (reference, params) => {
      const listing = await storage.listDirectory(inside(reference), params === undefined ? undefined : { ...params, startAfter: params.startAfter === undefined ? undefined : `${prefix}${params.startAfter}` })
      return {
        files: listing.files.map(file => ({ ...file, name: outside(file.name) })),
        directories: listing.directories.map(directory => ({ ...directory, name: outside(directory.name) }))
      }
    },
    createDirectory: async reference => { await storage.createDirectory(inside(reference)) },
    deleteDirectory: async reference => { await storage.deleteDirectory(inside(reference)) },
    moveDirectory: async (reference, destination) => { await storage.moveDirectory(inside(reference), `${prefix}${destination}`) }
  }
}

// WU4
if (enabled) {
  const storage = await storageRuntime.create({ region }, { name: 'conformance', resources: [bucket] })
  const database = await databaseRuntime.create({ region }, { name: 'conformance', resources: [] })
  const collection = { name: tableName, primaryKey: { key: 'id', schema: { type: 'string' } }, schema: { type: 'object' } } as unknown as CollectionReference
  const testDocuments = [{ name: 'createDocument', isA: true }, { name: 'updateDocument', isA: false }] as unknown as [Document, Document]

  beforeAll(async () => { await createRunTable() }, TABLE_TIMEOUT)
  afterAll(async () => {
    await deleteRunObjects()
    await deleteRunTable()
  }, TABLE_TIMEOUT)

  describe('OBJ-3: S3 conformance', { timeout: ONE_MINUTE }, () => { runStorageConformance(underPrefix(storage, objectPrefix), { bucket }) })
  describe('DDB-4, DDB-5, DDB-6, DDB-7: DynamoDB conformance', { timeout: ONE_MINUTE }, () => { runDatabaseConformance(database, { collection, testDocuments }) })
} else {
  describe.skip('AWS conformance (set GENOACMS_TEST_AWS=1)', () => { it('runs against real AWS', () => {}) })
}
