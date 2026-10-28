import { describe, it, beforeAll, afterAll } from 'vitest'
import { randomUUID } from 'node:crypto'
import { runStorageConformance, runDatabaseConformance } from '@genoacms/conformance'
import type { CollectionReference } from '@genoacms/contracts/database'
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
  const prefix = `conformance-${randomUUID()}`

  beforeAll(async () => { await createRunTable() }, TABLE_TIMEOUT)
  afterAll(async () => {
    await deleteRunObjects()
    await deleteRunTable()
  }, TABLE_TIMEOUT)

  describe('S3 conformance', { timeout: ONE_MINUTE }, () => { runStorageConformance(storage, { bucket }) })
  // RFC-0042
  describe.skip('DDB-4, DDB-5, DDB-6, DDB-7, DATA-2, DATA-3, DATA-4, DATA-5, DATA-6, DATA-7, DATA-8, DATA-9, DATA-10, DATA-12: DynamoDB conformance', { timeout: ONE_MINUTE }, () => { runDatabaseConformance(database, { collection, prefix }) })
} else {
  describe.skip('AWS conformance (set GENOACMS_TEST_AWS=1)', () => { it('runs against real AWS', () => {}) })
}
