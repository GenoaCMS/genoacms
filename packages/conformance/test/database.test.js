import { runDatabaseConformance } from '../src/index.js'
import { memoryDatabase } from './memory.js'

runDatabaseConformance(memoryDatabase(), {
  collection: { name: 'test', primaryKey: { key: 'id', schema: { type: 'string' } }, schema: { type: 'object' } },
  testDocuments: [{ name: 'a' }, { name: 'b' }]
})
