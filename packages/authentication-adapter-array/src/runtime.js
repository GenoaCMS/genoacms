import { defineRuntime } from '@genoacms/contracts'

// AUTHN-3
/**
 * @param {import('./config').credentialsArray} credentialsArray
 * @param {string} code
 * @param {(credentials: import('./config').Credentials) => boolean} isValid
 */
function assertEveryEntry (credentialsArray, code, isValid) {
    const invalid = credentialsArray.flatMap((credentials, index) => isValid(credentials) ? [] : [index])
    if (invalid.length === 0) return
    throw new Error(`authentication/${code}: at index ${invalid.join(', ')}`)
}

/**
 * This adapter has no provider-issued identifier to derive a subject from, so each entry
 * must declare one. Deriving it from the email would reintroduce the mutable-key problem
 * that `Identity.subject` exists to avoid, so an entry without a subject is a
 * configuration error rather than something to paper over at login time. AUTHN-4
 *
 * @param {unknown} credentialsArray
 * @returns {asserts credentialsArray is import('./config').credentialsArray}
 */
function assertValidCredentials (credentialsArray) {
    if (!Array.isArray(credentialsArray)) throw new Error('authentication/missing-credentials')
    assertEveryEntry(credentialsArray, 'missing-subject', credentials => Boolean(credentials?.subject))
    assertEveryEntry(credentialsArray, 'missing-password', credentials => typeof credentials.password === 'string')
}

/** @type {import('@genoacms/contracts/authentication').Rejection} */
const CREDENTIALS_REJECTED = Object.freeze({ rejected: 'credentials' })

/**
 * @param {import('./config').Credentials} credentials
 * @returns {import('@genoacms/contracts/authentication').Identity}
 */
function identityOf (credentials) {
    return { subject: credentials.subject, email: credentials.email }
}

/**
 * Authenticates against a fixed list of credentials, resolved from the provider's `credentials`
 * option: a JSON secret, an environment variable holding JSON, or an inline array.
 *
 * The subject check runs here rather than in the descriptor's `validate`, because only here are the
 * credentials resolved.
 */
export default defineRuntime({
    create ({ credentials: credentialsArray }) {
        assertValidCredentials(credentialsArray)

        return {
            /**
             * @type {import('@genoacms/contracts/authentication').Adapter['authenticate']}
             */
            async authenticate (email, password) {
                const credentials = credentialsArray.find(c => c.email === email)
                if (!credentials || credentials.password !== password) return CREDENTIALS_REJECTED
                return identityOf(credentials)
            },
            /**
             * @type {import('@genoacms/contracts/authentication').Adapter['getIdentity']}
             */
            async getIdentity (subject) {
                const credentials = credentialsArray.find(c => c.subject === subject)
                return credentials ? identityOf(credentials) : null
            }
        }
    }
})
