import { describe, it, expect } from 'vitest'
import runtime from './runtime.js'

const ctx = { name: 'array', resources: [] }
const ada = { subject: 's-ada', email: 'ada@example.com', password: 'lovelace' }

describe('the array authentication runtime', () => {
    it('AUTHN-3: a value that is not a list is refused with an authentication/ error', () => {
        expect(() => runtime.create({ credentials: { ada } }, ctx)).toThrow(/^authentication\/missing-credentials$/)
    })

    it('AUTHN-3: entries without a subject are named by index, never by email', () => {
        const credentials = [ada, { email: 'one@x', password: 'x' }, { ...ada, subject: 's-two', email: 'two@x' }, { email: 'three@x', password: 'x' }]
        expect(() => runtime.create({ credentials }, ctx)).toThrow(/^authentication\/missing-subject: at index 1, 3$/)
    })

    it('AUTHN-3: an entry that is not an object, or whose subject is empty, has no subject', () => {
        const credentials = [ada, null, 'ada@example.com', 5, { ...ada, subject: '', email: 'four@x' }]
        expect(() => runtime.create({ credentials }, ctx)).toThrow(/^authentication\/missing-subject: at index 1, 2, 3, 4$/)
    })

    it('AUTHN-3: an entry without a subject or a password is reported for its subject first', () => {
        expect(() => runtime.create({ credentials: [ada, { email: 'one@x' }] }, ctx)).toThrow(/^authentication\/missing-subject: at index 1$/)
    })

    it('AUTHN-4: an empty password is a string, and is accepted', async () => {
        const provider = runtime.create({ credentials: [{ ...ada, password: '' }] }, ctx)
        expect(await provider.authenticate(ada.email, '')).toEqual({ subject: ada.subject, email: ada.email })
    })

    it('AUTHN-3, AUTHN-4: an entry without a string password is refused', () => {
        const { password, ...withoutPassword } = ada
        expect(() => runtime.create({ credentials: [ada, { ...withoutPassword, subject: 's-1', email: 'one@x' }] }, ctx))
            .toThrow(/^authentication\/missing-password: at index 1$/)
        const nonStrings = [ada, { ...ada, subject: 's-1', email: 'one@x', password: 123 }, { ...ada, subject: 's-2', email: 'two@x', password: null }]
        expect(() => runtime.create({ credentials: nonStrings }, ctx)).toThrow(/^authentication\/missing-password: at index 1, 2$/)
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

    it('AUTHN-4: an email is not a subject', async () => {
        const provider = runtime.create({ credentials: [ada] }, ctx)
        expect(await provider.getIdentity('ada@example.com')).toBeNull()
    })

    it('keeps two providers independent', async () => {
        const first = runtime.create({ credentials: [ada] }, ctx)
        const second = runtime.create({ credentials: [{ subject: 's-bob', email: 'bob@example.com', password: 'b' }] }, ctx)
        expect(await first.authenticate('bob@example.com', 'b')).toEqual({ rejected: 'credentials' })
        expect(await second.authenticate('bob@example.com', 'b')).toEqual({ subject: 's-bob', email: 'bob@example.com' })
    })
})
