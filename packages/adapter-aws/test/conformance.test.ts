import { describe, it, beforeAll, afterAll } from 'vitest'
import { runStorageConformance, runDatabaseConformance } from '@genoacms/conformance'
import type { CollectionReference, Document } from '@genoacms/contracts/database'
import storageRuntime from '../src/storage/runtime.js'
import databaseRuntime from '../src/database/runtime.js'
import { enabled, region, bucket, tableName, createRunTable, deleteRunTable, deleteRunObjects } from './contract/aws.js'

const ONE_MINUTE = 60_000
const TABLE_TIMEOUT = 6 * ONE_MINUTE

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

  describe('S3 conformance', { timeout: ONE_MINUTE }, () => { runStorageConformance(storage, { bucket }) })
  describe('DDB-4, DDB-5, DDB-6, DDB-7: DynamoDB conformance', { timeout: ONE_MINUTE }, () => { runDatabaseConformance(database, { collection, testDocuments }) })
} else {
  describe.skip('AWS conformance (set GENOACMS_TEST_AWS=1)', () => { it('runs against real AWS', () => {}) })
}
