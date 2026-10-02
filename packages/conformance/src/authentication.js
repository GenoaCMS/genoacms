import { suite, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'

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
      const result = await adapter.authenticate(identity.email, identity.password)
      expect(result).toEqual({ subject: identity.subject, email: expect.any(String) })
    })

    it('AUTHN-2: a wrong password is rejected for credentials', async () => {
      expect(await adapter.authenticate(identity.email, `${identity.password}-wrong`)).toEqual(credentialsRejected)
    })

    it('AUTHN-2: an unknown email is rejected for credentials', async () => {
      expect(await adapter.authenticate(unknownEmail, identity.password)).toEqual(credentialsRejected)
    })

    it.skipIf(disabled === undefined)('AUTHN-2: a disabled identity\'s correct password is rejected', async () => {
      const result = await adapter.authenticate(disabled.email, disabled.password)
      expect([{ rejected: 'disabled' }, credentialsRejected]).toContainEqual(result)
    })

    it('AUTHN-4: getIdentity returns the fixture\'s identity', async () => {
      expect(await adapter.getIdentity(identity.subject)).toEqual({ subject: identity.subject, email: expect.any(String) })
    })

    it('AUTHN-4: getIdentity returns null for an unknown subject', async () => {
      expect(await adapter.getIdentity(unknownSubject)).toBeNull()
    })

    it.skipIf(disabled === undefined)('AUTHN-4: getIdentity returns null for a disabled subject', async () => {
      expect(await adapter.getIdentity(disabled.subject)).toBeNull()
    })
  })
}

export { runAuthenticationConformance }
