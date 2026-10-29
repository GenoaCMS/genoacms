import { afterAll, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { runDatabaseConformance } from '../../src/index.js'
import { MUTANTS, FAILING, CONFORMING, fixture } from './database.js'

const mutant = MUTANTS[process.env.GENOACMS_MUTANT] ?? FAILING[process.env.GENOACMS_MUTANT] ?? CONFORMING[process.env.GENOACMS_MUTANT]

if (mutant === undefined) {
  it.skip('is not a database mutant', () => {})
} else {
  const adapter = mutant.adapter()
  afterAll(async () => {
    if (process.env.GENOACMS_MUTANT_LEFTOVERS === undefined) return
    const { documents } = await adapter.getCollection(fixture.collection, { where: [{ field: 'run', operator: '==', value: fixture.prefix }] })
    writeFileSync(process.env.GENOACMS_MUTANT_LEFTOVERS, JSON.stringify(documents.map(document => document.reference.id)))
  })
  runDatabaseConformance(adapter, fixture)
}
