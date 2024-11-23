import { config } from '@genoacms/cloudabstraction'
import { callProvidersFunction, getProviders, isAnyTrue } from '../providers.server'

const authenticationProviders = await getProviders(config.authentication.providers)
const authorizationProviders = await getProviders(config.authorization.providers)

async function loginWithEmailAndPassword (email: string, password: string): Promise<boolean> {
  const results = await callProvidersFunction(authenticationProviders, 'loginWithEmailAndPassword', [email, password])
  const isSuccessful = isAnyTrue(results)
  return isSuccessful
}

async function isEmailAdmins (email: string): Promise<boolean> {
  const results = await callProvidersFunction(authorizationProviders, 'isEmailAdmins', [email])
  const isSuccessful = isAnyTrue(results)
  return isSuccessful
}

export {
  loginWithEmailAndPassword,
  isEmailAdmins
}
