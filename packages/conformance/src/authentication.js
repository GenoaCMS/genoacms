import { suite, it, expect } from 'vitest'
import { randomUUID } from 'node:crypto'
import fc from 'fast-check'

const THROTTLED = 'authentication/throttled'
/** A real provider answers each call over the network (CONF-4). */
const TEST_TIMEOUT = 120_000

/** @param {string} text */
const swapCase = text => [...text].map(c => c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()).join('')

/**
 * @param {string[]} characters
 * @param {number} at
 * @param {(character: string) => string[]} edit
 */
const editAt = (characters, at, edit) => [...characters.slice(0, at), ...edit(characters[at] ?? ''), ...characters.slice(at + 1)].join('')

const shiftCodePoint = (/** @type {string} */ c) => [String.fromCodePoint(c.codePointAt(0) ^ 1)]
const flipCase = (/** @type {string} */ c) => [c === c.toLowerCase() ? c.toUpperCase() : c.toLowerCase()]

/**
 * Every near miss of a text at its first, middle and last position, and with whitespace around it (CONF-4).
 *
 * @param {string} text
 */
function nearMissesOf (text) {
  const characters = [...text]
  const positions = [...new Set([0, Math.floor(characters.length / 2), Math.max(characters.length - 1, 0)])]
  const misses = [
    ...[...positions, characters.length].map(at => [...characters.slice(0, at), 'x', ...characters.slice(at)].join('')),
    ...positions.flatMap(at => [editAt(characters, at, () => []), editAt(characters, at, shiftCodePoint), editAt(characters, at, flipCase)]),
    ...[' ', '\t'].flatMap(space => [space + text, text + space, space + text + space])
  ]
  return [...new Set(misses)].filter(miss => miss !== text)
}

/**
 * Generated near misses of a text: one character inserted, removed, replaced or with its case changed, or whitespace around it.
 *
 * @param {string} text
 */
function nearMiss (text) {
  const characters = [...text]
  const at = fc.nat({ max: Math.max(characters.length - 1, 0) })
  return fc.oneof(
    fc.tuple(fc.nat({ max: characters.length }), fc.string({ minLength: 1, maxLength: 1 }))
      .map(([index, inserted]) => [...characters.slice(0, index), inserted, ...characters.slice(index)].join('')),
    at.map(index => editAt(characters, index, () => [])),
    fc.tuple(at, fc.string({ minLength: 1, maxLength: 1 })).map(([index, replacement]) => editAt(characters, index, () => [replacement])),
    at.map(index => editAt(characters, index, flipCase)),
    fc.tuple(fc.constantFrom(' ', '\t', '\n'), fc.constantFrom('before', 'after', 'around'))
      .map(([space, where]) => (where === 'after' ? '' : space) + text + (where === 'before' ? '' : space))
  ).filter(miss => miss !== text)
}

/**
 * Whether an answer to a wrong input is accepted: its rejection, or a refusal to answer (AUTHN-3).
 *
 * @param {() => Promise<unknown>} call
 * @param {unknown} expected
 */
async function answersOrThrottles (call, expected) {
  try {
    expect(await call()).toEqual(expected)
  } catch (error) {
    if (error instanceof Error && error.message.startsWith(THROTTLED)) return
    throw error
  }
}

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
 * @param {{ runs?: number }} [options] how many generated cases each property runs
 */
function runAuthenticationConformance (adapter, { identity, disabled }, { runs = 50 } = {}) {
  suite('authentication conformance', () => {
    const credentialsRejected = { rejected: 'credentials' }
    const unknownEmail = `conformance-unknown-${randomUUID()}@example.invalid`
    const unknownSubject = `conformance-unknown-${randomUUID()}`
    const known = [identity, ...(disabled === undefined ? [] : [disabled])]
    const isKnownEmail = (/** @type {string} */ email) => known.some(({ email: knownEmail }) => knownEmail.toLowerCase() === email.toLowerCase())
    const property = { numRuns: runs }

    /** @param {{ email: string, password: string }} who */
    async function wrongPasswordsAreRejected (who) {
      const others = known.filter(other => other !== who).map(({ password }) => password)
      for (const password of [`${who.password}-wrong`, '', ...nearMissesOf(who.password), ...others].filter(wrong => wrong !== who.password)) {
        await answersOrThrottles(() => adapter.authenticate(who.email, password), credentialsRejected)
      }
      await fc.assert(fc.asyncProperty(fc.oneof(fc.string(), nearMiss(who.password)).filter(wrong => wrong !== who.password), async password => {
        await answersOrThrottles(() => adapter.authenticate(who.email, password), credentialsRejected)
      }), property)
    }

    it('AUTHN-2: the fixture\'s credentials return its identity', async () => {
      expect(await adapter.authenticate(identity.email, identity.password)).toEqual({ subject: identity.subject, email: identity.email })
    }, TEST_TIMEOUT)

    it('AUTHN-2: a wrong password is rejected for credentials', async () => {
      await wrongPasswordsAreRejected(identity)
    }, TEST_TIMEOUT)

    it('AUTHN-2: an unknown email is rejected for credentials', async () => {
      const passwords = [...known.map(({ password }) => password), 'wrong']
      const emails = [unknownEmail, ...nearMissesOf(identity.email)].filter(email => !isKnownEmail(email))
      for (const email of emails) {
        for (const password of passwords) await answersOrThrottles(() => adapter.authenticate(email, password), credentialsRejected)
      }
      await fc.assert(fc.asyncProperty(
        fc.oneof(fc.emailAddress(), nearMiss(identity.email)).filter(email => !isKnownEmail(email)),
        fc.oneof(fc.constantFrom(...passwords), fc.string()),
        async (email, password) => { await answersOrThrottles(() => adapter.authenticate(email, password), credentialsRejected) }
      ), property)
    }, TEST_TIMEOUT)

    it.skipIf(disabled === undefined)('AUTHN-2: a disabled identity\'s correct password is rejected', async () => {
      const result = await adapter.authenticate(disabled.email, disabled.password)
      expect([{ rejected: 'disabled' }, credentialsRejected]).toContainEqual(result)
    }, TEST_TIMEOUT)

    it.skipIf(disabled === undefined)('AUTHN-2: a disabled identity\'s wrong password is rejected for credentials', async () => {
      await wrongPasswordsAreRejected(disabled)
    }, TEST_TIMEOUT)

    it('AUTHN-4: getIdentity returns the fixture\'s identity', async () => {
      expect(await adapter.getIdentity(identity.subject)).toEqual({ subject: identity.subject, email: identity.email })
    }, TEST_TIMEOUT)

    it('AUTHN-4: getIdentity returns null for an unknown subject', async () => {
      const subjects = [unknownSubject, swapCase(identity.subject), ...nearMissesOf(identity.subject), ...known.map(({ email }) => email)]
      for (const subject of subjects.filter(subject => subject !== identity.subject && subject !== '')) {
        expect(await adapter.getIdentity(subject)).toBeNull()
      }
      await fc.assert(fc.asyncProperty(
        fc.oneof(fc.string({ minLength: 1 }), nearMiss(identity.subject)).filter(subject => subject !== identity.subject && subject !== ''),
        async subject => { expect(await adapter.getIdentity(subject)).toBeNull() }
      ), property)
    }, TEST_TIMEOUT)

    it.skipIf(disabled === undefined)('AUTHN-4: getIdentity returns null for a disabled subject', async () => {
      expect(await adapter.getIdentity(disabled.subject)).toBeNull()
    }, TEST_TIMEOUT)

    it('AUTHN-2, AUTHN-4: the right answers do not change across calls', async () => {
      const asIdentity = { subject: identity.subject, email: identity.email }
      /** @type {Array<{ key: string, call: () => Promise<unknown>, right?: unknown[] } | { wrong: () => Promise<unknown> }>} */
      const calls = [
        { key: 'sign-in', call: () => adapter.authenticate(identity.email, identity.password), right: [asIdentity] },
        { key: 'lookup', call: () => adapter.getIdentity(identity.subject), right: [asIdentity] },
        { wrong: () => adapter.authenticate(identity.email, `${identity.password}-wrong`) },
        ...(disabled === undefined
          ? []
          : [
              { key: 'disabled sign-in', call: () => adapter.authenticate(disabled.email, disabled.password), right: [{ rejected: 'disabled' }, credentialsRejected] },
              { key: 'disabled lookup', call: () => adapter.getIdentity(disabled.subject), right: [null] },
              { wrong: () => adapter.authenticate(disabled.email, `${disabled.password}-wrong`) }
            ])
      ]
      await fc.assert(fc.asyncProperty(fc.array(fc.constantFrom(...calls), { minLength: 1, maxLength: 12 }), async sequence => {
        /** @type {Map<string, unknown>} */
        const first = new Map()
        for (const step of sequence) {
          if ('wrong' in step) {
            await step.wrong().catch(() => undefined)
            continue
          }
          let answer
          try {
            answer = await step.call()
          } catch (error) {
            if (error instanceof Error && error.message.startsWith(THROTTLED)) continue
            throw error
          }
          expect(step.right).toContainEqual(answer)
          if (first.has(step.key)) expect(answer).toEqual(first.get(step.key))
          else first.set(step.key, answer)
        }
      }), property)
    }, TEST_TIMEOUT)
  })
}

export { runAuthenticationConformance }
