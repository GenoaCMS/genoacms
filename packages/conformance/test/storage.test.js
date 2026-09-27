import { runStorageConformance } from '../src/index.js'
import { memoryStorage } from './memory.js'

runStorageConformance(memoryStorage(), { bucket: 'b' })
