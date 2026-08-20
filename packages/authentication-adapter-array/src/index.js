import { getProvider } from '@genoacms/cloudabstraction'

const ADAPTER_PATH = '@genoacms/authentication-adapter-array'
const providerConfig = getProvider('authentication', ADAPTER_PATH)
const credentialsArray = providerConfig.credentials
if (!credentialsArray) throw new Error('missing-credentials')
assertEverySubjectDeclared(credentialsArray)

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
 * @type {import('@genoacms/cloudabstraction').authentication.Adapter.authenticate}
 */
async function authenticate (email, password) {
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

export {
    authenticate
}
