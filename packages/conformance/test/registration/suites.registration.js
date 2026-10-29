import { describe } from 'vitest'
import { runStorageConformance, runDatabaseConformance, runAuthenticationConformance } from '../../src/index.js'
import { memoryStorage, memoryDatabase } from '../memory.js'
import { fixture, correct } from '../mutants/authentication.js'

const databaseFixture = () => ({
  collection: { name: 'test', primaryKey: { key: 'id', schema: { type: 'string' } }, schema: { type: 'object' } },
  prefix: 'registration'
})

runStorageConformance(memoryStorage(['b']), { bucket: 'b' })
runDatabaseConformance(memoryDatabase(), databaseFixture())
runAuthenticationConformance(correct(), fixture, { runs: 1 })

describe('inside a describe', () => {
  runStorageConformance(memoryStorage(['b']), { bucket: 'b' })
  runDatabaseConformance(memoryDatabase(), databaseFixture())
  runAuthenticationConformance(correct(), fixture, { runs: 1 })
})
