import { runAuthenticationConformance } from '../../src/index.js'
import { MUTANTS, fixture } from './authentication.js'

runAuthenticationConformance(MUTANTS[process.env.GENOACMS_MUTANT].adapter(), fixture)
