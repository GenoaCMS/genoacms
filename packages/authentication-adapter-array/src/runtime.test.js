import { describe, it, expect } from 'vitest'
import runtime from './runtime.js'

const ctx = { name: 'array', resources: [] }
const ada = { subject: 's-ada', email: 'ada@example.com', password: 'lovelace' }

describe('the array authentication runtime', () => {
    it('refuses a value that is not a list', () => {
        expect(() => runtime.create({ credentials: { ada } }, ctx)).toThrow('missing-credentials')
    })

    it('refuses an entry without a subject, naming its email', () => {
        expect(() => runtime.create({ credentials: [ada, { email: 'no@subject', password: 'x' }] }, ctx)).toThrow('missing-subject: no@subject')
    })

    it('AUTHN-2: authenticates a matching email and password to its subject', async () => {
        const provider = runtime.create({ credentials: [ada] }, ctx)
        expect(await provider.authenticate('ada@example.com', 'lovelace')).toEqual({ subject: 's-ada', email: 'ada@example.com' })
    })

    it('AUTHN-2: rejects a wrong password and an unknown email for credentials', async () => {
        const provider = runtime.create({ credentials: [ada] }, ctx)
        expect(await provider.authenticate('ada@example.com', 'wrong')).toEqual({ rejected: 'credentials' })
        expect(await provider.authenticate('nobody@example.com', 'lovelace')).toEqual({ rejected: 'credentials' })
    })

    it('AUTHN-4: looks a subject up', async () => {
        const provider = runtime.create({ credentials: [ada] }, ctx)
        expect(await provider.getIdentity('s-ada')).toEqual({ subject: 's-ada', email: 'ada@example.com' })
        expect(await provider.getIdentity('nobody')).toBeNull()
    })

    it('keeps two providers independent', async () => {
        const first = runtime.create({ credentials: [ada] }, ctx)
        const second = runtime.create({ credentials: [{ subject: 's-bob', email: 'bob@example.com', password: 'b' }] }, ctx)
        expect(await first.authenticate('bob@example.com', 'b')).toEqual({ rejected: 'credentials' })
        expect(await second.authenticate('bob@example.com', 'b')).toEqual({ subject: 's-bob', email: 'bob@example.com' })
    })
})
