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

    it('authenticates a matching email and password to its subject', async () => {
        const provider = runtime.create({ credentials: [ada] }, ctx)
        expect(await provider.authenticate('ada@example.com', 'lovelace')).toEqual({ subject: 's-ada', email: 'ada@example.com' })
    })

    it('refuses a wrong password and an unknown email', async () => {
        const provider = runtime.create({ credentials: [ada] }, ctx)
        expect(await provider.authenticate('ada@example.com', 'wrong')).toBeNull()
        expect(await provider.authenticate('nobody@example.com', 'lovelace')).toBeNull()
    })

    it('keeps two providers independent', async () => {
        const first = runtime.create({ credentials: [ada] }, ctx)
        const second = runtime.create({ credentials: [{ subject: 's-bob', email: 'bob@example.com', password: 'b' }] }, ctx)
        expect(await first.authenticate('bob@example.com', 'b')).toBeNull()
        expect(await second.authenticate('bob@example.com', 'b')).toEqual({ subject: 's-bob', email: 'bob@example.com' })
    })
})
