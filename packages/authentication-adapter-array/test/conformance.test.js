import { runAuthenticationConformance } from '@genoacms/conformance'
import runtime from '../src/runtime.js'

const identity = { subject: 's-ada', email: 'ada@example.com', password: 'lovelace' }

runAuthenticationConformance(runtime.create({ credentials: [identity] }, { name: 'conformance', resources: [] }), { identity })
