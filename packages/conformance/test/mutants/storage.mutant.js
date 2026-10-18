import { afterAll, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { runStorageConformance } from '../../src/index.js'
import { MUTANTS, FAILING, fixture } from './storage.js'

const mutant = MUTANTS[process.env.GENOACMS_MUTANT] ?? FAILING[process.env.GENOACMS_MUTANT]
const SUITE_PREFIX = 'genoacms-conformance-'

if (mutant === undefined) {
  it.skip('is not a storage mutant', () => {})
} else {
  const adapter = mutant.adapter()
  afterAll(async () => {
    if (process.env.GENOACMS_MUTANT_LEFTOVERS === undefined) return
    const { files, directories } = await adapter.listDirectory({ bucket: fixture.bucket, name: '' })
    const leftovers = [...files, ...directories].map(entry => entry.name).filter(name => name.startsWith(SUITE_PREFIX))
    writeFileSync(process.env.GENOACMS_MUTANT_LEFTOVERS, JSON.stringify(leftovers))
  })
  runStorageConformance(adapter, fixture)
}
