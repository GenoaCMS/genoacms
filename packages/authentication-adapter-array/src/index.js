import { config } from '@genoacms/cloudabstraction'

/**
 * @type {import('@genoacms/cloudabstraction').authentication.loginWithEmailAndPassword}
 */
async function loginWithEmailAndPassword (email, password) {
    /**
     * @type {import('./config'.credentialsArray).credentialsArray | undefined}
     */
    const providerConfig = config?.authentication?.providers.find(p => p.name === '@genoacms/authentication-adapter-array')
    if (!providerConfig) throw new Error('missing-provider-config')
    const credentialsArray = providerConfig.credentials
    if (!credentialsArray) throw new Error('missing-credentials')
    const credentials = credentialsArray.find(c => c.email === email)
    if (!credentials) throw new Error('invalid-credentials')
    return credentials.password === password
}

export {
    loginWithEmailAndPassword
}
