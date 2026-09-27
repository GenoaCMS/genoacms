import { defineRuntime } from '@genoacms/contracts'

/**
 * This adapter has no provider-issued identifier to derive a subject from, so each entry
 * must declare one. Deriving it from the email would reintroduce the mutable-key problem
 * that `Identity.subject` exists to avoid, so an entry without a subject is a
 * configuration error rather than something to paper over at login time.
 *
 * @param {import('./config').credentialsArray} credentialsArray
 */
function assertEverySubjectDeclared (credentialsArray) {
    const withoutSubject = credentialsArray.filter(c => !c.subject)
    if (withoutSubject.length === 0) return
    const emails = withoutSubject.map(c => c.email).join(', ')
    throw new Error(`missing-subject: ${emails}`)
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
        if (!Array.isArray(credentialsArray)) throw new Error('missing-credentials')
        assertEverySubjectDeclared(credentialsArray)

        return {
            /**
             * @type {import('@genoacms/contracts/authentication').Adapter['authenticate']}
             */
            async authenticate (email, password) {
                /**
                 * @type {import('./config').Credentials | undefined}
                 */
                const credentials = credentialsArray.find(c => c.email === email)
                if (!credentials) return null
                if (credentials.password !== password) return null
                return {
                    subject: credentials.subject,
                    email: credentials.email
                }
            }
        }
    }
})
