import { describe, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { runStorageConformance, runDatabaseConformance } from '@genoacms/conformance'
import storageRuntime from '../src/storage/runtime.js'
import databaseRuntime from '../src/database/runtime.js'

// GU2, GD6
if (process.env.GENOACMS_TEST_GCP === '1') {
  const bucket = process.env.GENOACMS_TEST_GCP_BUCKET as string
  const projectId = process.env.GENOACMS_TEST_GCP_PROJECT as string
  const storage = await storageRuntime.create({ projectId }, { name: 'conformance', resources: [bucket] })
  describe('Cloud Storage conformance', () => { runStorageConformance(storage, { bucket }) })
  const database = await databaseRuntime.create({ projectId }, { name: 'conformance', resources: ['test'] })
  describe('DB-3, DB-4, DB-5, DB-6, DB-7, DATA-2, DATA-3, DATA-4, DATA-5, DATA-6, DATA-7, DATA-8, DATA-9, DATA-10, DATA-12: Firestore conformance', () => { runDatabaseConformance(database, {
    collection: { name: 'genoacms-conformance', primaryKey: { key: 'id', schema: { type: 'string' } as any }, schema: { type: 'object' } as any },
    prefix: `conformance-${randomUUID()}`
  }) })
} else {
  describe.skip('GCP conformance (set GENOACMS_TEST_GCP=1)', () => { it('runs against real GCP', () => {}) })
}
