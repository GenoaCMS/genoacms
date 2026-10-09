import { runAuthenticationConformance } from '../../src/index.js'
import { MUTANTS, CONFORMING, fixture } from './authentication.js'

runAuthenticationConformance((MUTANTS[process.env.GENOACMS_MUTANT] ?? CONFORMING[process.env.GENOACMS_MUTANT]).adapter(), fixture)
