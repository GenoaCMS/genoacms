import { getProvider } from '@genoacms/cloudabstraction'

const ADAPTER_PATH = '@genoacms/authentication-adapter-array'
const providerConfig = getProvider('authentication', ADAPTER_PATH)
const credentialsArray = providerConfig.credentials
if (!credentialsArray) throw new Error('missing-credentials')

/**
 * @type {import('@genoacms/cloudabstraction').authentication.loginWithEmailAndPassword}
 */
async function loginWithEmailAndPassword (email, password) {
    /**
     * @type {import('./config'.credentialsArray).credentialsArray | undefined}
     */
    const credentials = credentialsArray.find(c => c.email === email)
    if (!credentials) throw new Error('invalid-credentials')
    return credentials.password === password
}

export {
    loginWithEmailAndPassword
}
