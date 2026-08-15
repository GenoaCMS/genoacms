import { config } from '@genoacms/cloudabstraction'
import type { authentication } from '@genoacms/cloudabstraction'
import { callProvidersFunction, getProviders, isAnyTrue, firstNonNull } from '../providers.server'

const authenticationProviders = await getProviders(config.authentication.providers)
const authorizationProviders = await getProviders(config.authorization.providers)

async function authenticate (email: string, password: string): Promise<authentication.Identity | null> {
  const results = await callProvidersFunction(authenticationProviders, 'authenticate', [email, password])
  return firstNonNull<authentication.Identity>(results)
}

async function isEmailAdmins (email: string): Promise<boolean> {
  const results = await callProvidersFunction(authorizationProviders, 'isEmailAdmins', [email])
  const isSuccessful = isAnyTrue(results)
  return isSuccessful
}

export {
  authenticate,
  isEmailAdmins
}
