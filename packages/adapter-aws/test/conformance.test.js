import { describe, it } from 'vitest'
import { runStorageConformance, runDatabaseConformance } from '@genoacms/conformance'
import storageRuntime from '../src/storage/runtime.js'
import databaseRuntime from '../src/database/runtime.js'

/** Against real AWS: opt-in with GENOACMS_TEST_AWS=1; credentials from the SDK's default chain. */
if (process.env.GENOACMS_TEST_AWS === '1') {
  const region = process.env.GENOACMS_TEST_AWS_REGION
  const bucket = process.env.GENOACMS_TEST_AWS_BUCKET
  const table = process.env.GENOACMS_TEST_AWS_TABLE
  runStorageConformance(storageRuntime.create({ region }, { name: 'conformance', resources: [bucket] }), { bucket })
  runDatabaseConformance(databaseRuntime.create({ region }, { name: 'conformance', resources: [] }), {
    collection: { name: table, primaryKey: { key: 'id', schema: { type: 'string' } }, schema: { type: 'object' } },
    testDocuments: [{ name: 'createDocument', isA: true }, { name: 'updateDocument', isA: false }]
  })
} else {
  describe.skip('AWS conformance (set GENOACMS_TEST_AWS=1)', () => { it('runs against real AWS', () => {}) })
}
