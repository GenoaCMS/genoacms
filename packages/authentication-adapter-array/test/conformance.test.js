import { describe } from 'vitest'
import { runAuthenticationConformance } from '@genoacms/conformance'
import runtime from '../src/runtime.js'

const identity = { subject: 's-ada', email: 'ada@example.com', password: 'lovelace' }

describe('CONF-4: array adapter conformance', () => {
  runAuthenticationConformance(runtime.create({ credentials: [identity] }, { name: 'conformance', resources: [] }), { identity })
})
