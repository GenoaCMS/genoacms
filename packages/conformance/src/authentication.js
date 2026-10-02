import { suite, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'

/** @param {string} text */
const swapCase = text => [...text].map(c => c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()).join('')

/** @param {string} text */
const withFirstChanged = text => {
  const [first, ...rest] = [...text]
  return first === undefined ? 'x' : String.fromCodePoint(first.codePointAt(0) ^ 1) + rest.join('')
}

/**
 * The near misses of a password that are tried as wrong ones (CONF-4).
 *
 * @param {string} password
 */
const wrongPasswordsFor = password =>
  [`${password}-wrong`, '', password.slice(0, -1), withFirstChanged(password), swapCase(password), ` ${password} `]
    .filter(wrong => wrong !== password)

/**
 * Registers the authentication conformance suite with vitest (CONF-4).
 *
 * The fixture's identities exist before the suite runs: the contract cannot create them.
 *
 * @param {import('@genoacms/contracts/authentication').Adapter} adapter
 * @param {{
 *   identity: { email: string, password: string, subject: string },
 *   disabled?: { email: string, password: string, subject: string }
 * }} fixture
 */
function runAuthenticationConformance (adapter, { identity, disabled }) {
  suite('authentication conformance', () => {
    const credentialsRejected = { rejected: 'credentials' }
    const unknownEmail = `conformance-unknown-${randomUUID()}@example.invalid`
    const unknownSubject = `conformance-unknown-${randomUUID()}`

    it('AUTHN-2: the fixture\'s credentials return its identity', async () => {
      for (let presented = 0; presented < 2; presented++) {
        expect(await adapter.authenticate(identity.email, identity.password)).toEqual({ subject: identity.subject, email: identity.email })
      }
    })

    it('AUTHN-2: a wrong password is rejected for credentials', async () => {
      for (const password of wrongPasswordsFor(identity.password)) {
        expect(await adapter.authenticate(identity.email, password)).toEqual(credentialsRejected)
      }
    })

    it('AUTHN-2: an unknown email is rejected for credentials', async () => {
      expect(await adapter.authenticate(unknownEmail, identity.password)).toEqual(credentialsRejected)
    })

    it.skipIf(disabled === undefined)('AUTHN-2: a disabled identity\'s correct password is rejected', async () => {
      const result = await adapter.authenticate(disabled.email, disabled.password)
      expect([{ rejected: 'disabled' }, credentialsRejected]).toContainEqual(result)
    })

    it.skipIf(disabled === undefined)('AUTHN-2: a disabled identity\'s wrong password is rejected for credentials', async () => {
      for (const password of wrongPasswordsFor(disabled.password)) {
        expect(await adapter.authenticate(disabled.email, password)).toEqual(credentialsRejected)
      }
    })

    it('AUTHN-4: getIdentity returns the fixture\'s identity', async () => {
      for (let asked = 0; asked < 2; asked++) {
        expect(await adapter.getIdentity(identity.subject)).toEqual({ subject: identity.subject, email: identity.email })
      }
    })

    it('AUTHN-4: getIdentity returns null for an unknown subject', async () => {
      const nearMisses = [identity.email, identity.subject.slice(0, -1), swapCase(identity.subject)].filter(subject => subject !== identity.subject)
      for (const subject of [unknownSubject, ...nearMisses]) {
        expect(await adapter.getIdentity(subject)).toBeNull()
      }
    })

    it.skipIf(disabled === undefined)('AUTHN-4: getIdentity returns null for a disabled subject', async () => {
      for (let asked = 0; asked < 2; asked++) {
        expect(await adapter.getIdentity(disabled.subject)).toBeNull()
      }
    })
  })
}

export { runAuthenticationConformance }
