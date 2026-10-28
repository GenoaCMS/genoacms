import { describe, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { runDatabaseConformance } from '@genoacms/conformance'
import runtime from '../src/runtime.js'
import { collection, recreateConformanceTable } from './fixture.js'

/** Against a real Postgres: opt-in with GENOACMS_TEST_POSTGRES=1; the connection comes from the PG* variables. */
if (process.env.GENOACMS_TEST_POSTGRES === '1') {
  const connection = {
    host: process.env.PGHOST,
    port: process.env.PGPORT === undefined ? undefined : Number(process.env.PGPORT),
    database: process.env.PGDATABASE,
    user: process.env.PGUSER,
    password: process.env.PGPASSWORD
  }
  await recreateConformanceTable(connection)
  const database = runtime.create(connection, { name: 'conformance', resources: ['postgres'] })
  // RFC-0042
  describe.skip('DATA-2, DATA-3, DATA-4, DATA-5, DATA-6, DATA-7, DATA-8, DATA-9, DATA-10, DATA-12: Postgres conformance', () => {
    runDatabaseConformance(database, { collection, prefix: `conformance-${randomUUID()}` })
  })
} else {
  describe.skip('Postgres conformance (set GENOACMS_TEST_POSTGRES=1)', () => { it('runs against a real Postgres', () => {}) })
}
