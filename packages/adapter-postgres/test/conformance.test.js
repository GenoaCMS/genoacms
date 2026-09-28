import { describe, it } from 'vitest'
import { runDatabaseConformance } from '@genoacms/conformance'
import runtime from '../src/runtime.js'
import { collections, testDocuments, recreateReferencesTable } from './fixture.js'

/** Against a real Postgres: opt-in with GENOACMS_TEST_POSTGRES=1; the connection comes from the PG* variables. */
if (process.env.GENOACMS_TEST_POSTGRES === '1') {
  const connection = {
    host: process.env.PGHOST,
    port: process.env.PGPORT === undefined ? undefined : Number(process.env.PGPORT),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD
  }
  await recreateReferencesTable(connection)
  const database = runtime.create(connection, { name: 'conformance', resources: ['postgres'] })
  runDatabaseConformance(database, { collection: collections[0], testDocuments })
} else {
  describe.skip('Postgres conformance (set GENOACMS_TEST_POSTGRES=1)', () => { it('runs against a real Postgres', () => {}) })
}
