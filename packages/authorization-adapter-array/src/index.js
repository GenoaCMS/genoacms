import { getProvider } from '@genoacms/cloudabstraction'

const ADAPTER_PATH = '@genoacms/authorization-adapter-array'
const providerConfig = getProvider('authorization', ADAPTER_PATH)
const usersArray = providerConfig.users
if (!usersArray) throw new Error('missing-users')

/**
 * @type {import('@genoacms/cloudabstraction/authorization').isEmailAdmins}
 */
async function isEmailAdmins (email) {
    /**
     * @type {import('./config').User | undefined}
     */
    const user = usersArray.find(c => c.email === email)
    return !!user
}

export {
    isEmailAdmins
}
