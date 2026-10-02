import { memoryAuthentication } from '../memory.js'

const identity = { subject: 's-ada', email: 'ada@example.com', password: 'lovelace' }
const disabled = { subject: 's-bob', email: 'bob@example.com', password: 'babbage' }
const fixture = { identity, disabled }
const correct = () => memoryAuthentication([identity, { ...disabled, disabled: true }])
const identityOf = ({ subject, email }) => ({ subject, email })

/** One adapter per suite test, each violating exactly that test's assertion (CONF-4). */
const MUTANTS = {
  'any password signs in': {
    test: 'AUTHN-2: a wrong password is rejected for credentials',
    adapter: () => ({ ...correct(), authenticate: async (email, password) => email === identity.email ? identityOf(identity) : correct().authenticate(email, password) })
  },
  'the fixture cannot sign in': {
    test: 'AUTHN-2: the fixture\'s credentials return its identity',
    adapter: () => ({ ...correct(), authenticate: async () => ({ rejected: 'credentials' }) })
  },
  'an unknown email answers null': {
    test: 'AUTHN-2: an unknown email is rejected for credentials',
    adapter: () => ({ ...correct(), authenticate: async (email, password) => [identity.email, disabled.email].includes(email) ? correct().authenticate(email, password) : null })
  },
  'a disabled identity signs in': {
    test: 'AUTHN-2: a disabled identity\'s correct password is rejected',
    adapter: () => ({ ...correct(), authenticate: async (email, password) => email === disabled.email && password === disabled.password ? identityOf(disabled) : correct().authenticate(email, password) })
  },
  'the identity carries another email': {
    test: 'AUTHN-2: the fixture\'s credentials return its identity',
    adapter: () => ({ ...correct(), authenticate: async (email, password) => email === identity.email && password === identity.password ? { subject: identity.subject, email: '' } : correct().authenticate(email, password) })
  },
  'the empty password signs in': {
    test: 'AUTHN-2: a wrong password is rejected for credentials',
    adapter: () => ({ ...correct(), authenticate: async (email, password) => email === identity.email && password === '' ? identityOf(identity) : correct().authenticate(email, password) })
  },
  'disabled is answered before the password': {
    test: 'AUTHN-2: a disabled identity\'s wrong password is rejected for credentials',
    adapter: () => ({ ...correct(), authenticate: async (email, password) => email === disabled.email ? { rejected: 'disabled' } : correct().authenticate(email, password) })
  },
  'a password compared without case': {
    test: 'AUTHN-2: a wrong password is rejected for credentials',
    adapter: () => ({ ...correct(), authenticate: async (email, password) => email === identity.email && password.toLowerCase() === identity.password.toLowerCase() ? identityOf(identity) : correct().authenticate(email, password) })
  },
  'disabled is answered to the empty password': {
    test: 'AUTHN-2: a disabled identity\'s wrong password is rejected for credentials',
    adapter: () => ({ ...correct(), authenticate: async (email, password) => email === disabled.email && password === '' ? { rejected: 'disabled' } : correct().authenticate(email, password) })
  },
  'getIdentity answers the fixture\'s email': {
    test: 'AUTHN-4: getIdentity returns null for an unknown subject',
    adapter: () => ({ ...correct(), getIdentity: async (subject) => subject === identity.email ? identityOf(identity) : correct().getIdentity(subject) })
  },
  'the fixture signs in only once': {
    test: 'AUTHN-2: the fixture\'s credentials return its identity',
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
  'getIdentity returns a stale email': {
    test: 'AUTHN-4: getIdentity returns the fixture\'s identity',
    adapter: () => ({ ...correct(), getIdentity: async (subject) => subject === identity.subject ? { subject, email: 'stale@example.com' } : correct().getIdentity(subject) })
  },
  'the fixture cannot be looked up': {
    test: 'AUTHN-4: getIdentity returns the fixture\'s identity',
    adapter: () => ({ ...correct(), getIdentity: async () => null })
  },
  'an unknown subject is found': {
    test: 'AUTHN-4: getIdentity returns null for an unknown subject',
    adapter: () => ({ ...correct(), getIdentity: async (subject) => [identity.subject, disabled.subject].includes(subject) ? correct().getIdentity(subject) : { subject, email: 'x@example.com' } })
  },
  'a disabled subject is found': {
    test: 'AUTHN-4: getIdentity returns null for a disabled subject',
    adapter: () => ({ ...correct(), getIdentity: async (subject) => subject === disabled.subject ? identityOf(disabled) : correct().getIdentity(subject) })
  }
}

export { MUTANTS, fixture, correct }
