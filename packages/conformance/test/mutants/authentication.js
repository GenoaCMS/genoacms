import { memoryAuthentication } from '../memory.js'

const identity = { subject: 's-ada', email: 'ada@example.com', password: 'lovelace' }
const disabled = { subject: 's-bob', email: 'bob@example.com', password: 'babbage' }
const fixture = { identity, disabled }
const correct = () => memoryAuthentication([identity, { ...disabled, disabled: true }])
const identityOf = ({ subject, email }) => ({ subject, email })

/** One adapter per suite test, each violating exactly that test's assertion (CONF-4). */
const MUTANTS = {
  'any password signs in': {
    tests: ['AUTHN-2: a wrong password is rejected for credentials'],
    adapter: () => ({ ...correct(), authenticate: async (email, password) => email === identity.email ? identityOf(identity) : correct().authenticate(email, password) })
  },
  'the fixture cannot sign in': {
    tests: ['AUTHN-2: the fixture\'s credentials return its identity', 'AUTHN-2, AUTHN-4: the right answers do not change across calls'],
    adapter: () => ({ ...correct(), authenticate: async () => ({ rejected: 'credentials' }) })
  },
  'an unknown email answers null': {
    tests: ['AUTHN-2: an unknown email is rejected for credentials'],
    adapter: () => ({ ...correct(), authenticate: async (email, password) => [identity.email, disabled.email].includes(email) ? correct().authenticate(email, password) : null })
  },
  'a disabled identity signs in': {
    tests: ['AUTHN-2: a disabled identity\'s correct password is rejected', 'AUTHN-2, AUTHN-4: the right answers do not change across calls'],
    adapter: () => ({ ...correct(), authenticate: async (email, password) => email === disabled.email && password === disabled.password ? identityOf(disabled) : correct().authenticate(email, password) })
  },
  'the identity carries another email': {
    tests: ['AUTHN-2: the fixture\'s credentials return its identity', 'AUTHN-2, AUTHN-4: the right answers do not change across calls'],
    adapter: () => ({ ...correct(), authenticate: async (email, password) => email === identity.email && password === identity.password ? { subject: identity.subject, email: '' } : correct().authenticate(email, password) })
  },
  'the empty password signs in': {
    tests: ['AUTHN-2: a wrong password is rejected for credentials'],
    adapter: () => ({ ...correct(), authenticate: async (email, password) => email === identity.email && password === '' ? identityOf(identity) : correct().authenticate(email, password) })
  },
  'disabled is answered before the password': {
    tests: ['AUTHN-2: a disabled identity\'s wrong password is rejected for credentials'],
    adapter: () => ({ ...correct(), authenticate: async (email, password) => email === disabled.email ? { rejected: 'disabled' } : correct().authenticate(email, password) })
  },
  'a password compared without case': {
    tests: ['AUTHN-2: a wrong password is rejected for credentials'],
    adapter: () => ({ ...correct(), authenticate: async (email, password) => email === identity.email && password.toLowerCase() === identity.password.toLowerCase() ? identityOf(identity) : correct().authenticate(email, password) })
  },
  'disabled is answered to the empty password': {
    tests: ['AUTHN-2: a disabled identity\'s wrong password is rejected for credentials'],
    adapter: () => ({ ...correct(), authenticate: async (email, password) => email === disabled.email && password === '' ? { rejected: 'disabled' } : correct().authenticate(email, password) })
  },
  'getIdentity answers the fixture\'s email': {
    tests: ['AUTHN-4: getIdentity returns null for an unknown subject'],
    adapter: () => ({ ...correct(), getIdentity: async (subject) => subject === identity.email ? identityOf(identity) : correct().getIdentity(subject) })
  },
  'the fixture signs in only once': {
    tests: ['AUTHN-2, AUTHN-4: the right answers do not change across calls'],
    adapter: () => {
      let signedIn = false
      return {
        ...correct(),
        authenticate: async (email, password) => {
          const result = await correct().authenticate(email, password)
          if (!('subject' in result)) return result
          if (signedIn) return { rejected: 'credentials' }
          signedIn = true
          return result
        }
      }
    }
  },
  'a disabled subject is found from the second time': {
    tests: ['AUTHN-2, AUTHN-4: the right answers do not change across calls'],
    adapter: () => {
      let asked = false
      return { ...correct(), getIdentity: async (subject) => { if (subject !== disabled.subject) return correct().getIdentity(subject); const found = asked; asked = true; return found ? identityOf(disabled) : null } }
    }
  },
  'a trailing space is ignored': {
    tests: ['AUTHN-2: a wrong password is rejected for credentials'],
    adapter: () => ({ ...correct(), authenticate: async (email, password) => email === identity.email && password.trimEnd() === identity.password ? identityOf(identity) : correct().authenticate(email, password) })
  },
  'an unknown email signs in with another password': {
    tests: ['AUTHN-2: an unknown email is rejected for credentials'],
    adapter: () => ({ ...correct(), authenticate: async (email, password) => ![identity.email, disabled.email].includes(email) && password !== identity.password ? identityOf(identity) : correct().authenticate(email, password) })
  },
  'getIdentity accepts a suffix': {
    tests: ['AUTHN-4: getIdentity returns null for an unknown subject'],
    adapter: () => ({ ...correct(), getIdentity: async (subject) => subject.startsWith(identity.subject) ? identityOf(identity) : correct().getIdentity(subject) })
  },
  'getIdentity returns a stale email': {
    tests: ['AUTHN-4: getIdentity returns the fixture\'s identity', 'AUTHN-2, AUTHN-4: the right answers do not change across calls'],
    adapter: () => ({ ...correct(), getIdentity: async (subject) => subject === identity.subject ? { subject, email: 'stale@example.com' } : correct().getIdentity(subject) })
  },
  'the fixture cannot be looked up': {
    tests: ['AUTHN-4: getIdentity returns the fixture\'s identity', 'AUTHN-2, AUTHN-4: the right answers do not change across calls'],
    adapter: () => ({ ...correct(), getIdentity: async () => null })
  },
  'an unknown subject is found': {
    tests: ['AUTHN-4: getIdentity returns null for an unknown subject'],
    adapter: () => ({ ...correct(), getIdentity: async (subject) => [identity.subject, disabled.subject].includes(subject) ? correct().getIdentity(subject) : { subject, email: 'x@example.com' } })
  },
  'a disabled subject is found': {
    tests: ['AUTHN-4: getIdentity returns null for a disabled subject', 'AUTHN-2, AUTHN-4: the right answers do not change across calls'],
    adapter: () => ({ ...correct(), getIdentity: async (subject) => subject === disabled.subject ? identityOf(disabled) : correct().getIdentity(subject) })
  }
}

export { MUTANTS, fixture, correct }
