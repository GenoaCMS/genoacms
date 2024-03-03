import { config } from '@genoacms/cloudabstraction'

/**
 * @type {import('@genoacms/cloudabstraction').authentication.loginWithEmailAndPassword}
 */
async function loginWithEmailAndPassword (email, password) {
    /**
     * @type {import('./config'.credentialsArray).credentialsArray | undefined}
     */
    const credentialsArray = config?.authentication?.credentials
    if (!credentialsArray) throw new Error('missing-credentials')
    const credentials = credentialsArray.find(c => c.email === email)
    if (!credentials) throw new Error('invalid-credentials')
    return credentials.password === password
}

export {
    loginWithEmailAndPassword
}
