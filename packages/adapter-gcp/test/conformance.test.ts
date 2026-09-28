import { describe, it } from 'vitest'
import { runStorageConformance, runDatabaseConformance } from '@genoacms/conformance'
import storageRuntime from '../src/storage/runtime.js'
import databaseRuntime from '../src/database/runtime.js'

/**
 * Against real GCP: opt-in with GENOACMS_TEST_GCP=1. Credentials come only from Application Default
 * Credentials in the operator's shell (GOOGLE_APPLICATION_CREDENTIALS); this test reads no key file.
 */
if (process.env.GENOACMS_TEST_GCP === '1') {
  const bucket = process.env.GENOACMS_TEST_GCP_BUCKET as string
  const projectId = process.env.GENOACMS_TEST_GCP_PROJECT as string
  const storage = await storageRuntime.create({ projectId }, { name: 'conformance', resources: [bucket] })
  describe('STO-4: Cloud Storage conformance', () => { runStorageConformance(storage, { bucket }) })
  const database = await databaseRuntime.create({ projectId }, { name: 'conformance', resources: ['test'] })
  describe('DB-3, DB-4, DB-5, DB-6, DB-7: Firestore conformance', () => { runDatabaseConformance(database, {
    collection: { name: 'genoacms-conformance', primaryKey: { key: 'id', schema: { type: 'string' } as any }, schema: { type: 'object' } as any },
    testDocuments: [{ name: 'createDocument', isA: true } as any, { name: 'updateDocument', isA: false } as any]
  }) })
} else {
  describe.skip('GCP conformance (set GENOACMS_TEST_GCP=1)', () => { it('runs against real GCP', () => {}) })
}
