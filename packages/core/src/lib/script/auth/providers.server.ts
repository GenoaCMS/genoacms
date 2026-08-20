import { config } from '@genoacms/cloudabstraction'
import type { authentication } from '@genoacms/cloudabstraction'
import { callProvidersFunction, getProviders, firstNonNull } from '../providers.server'

const authenticationProviders = await getProviders(config.authentication.providers)

async function authenticate (email: string, password: string): Promise<authentication.Identity | null> {
  const results = await callProvidersFunction(authenticationProviders, 'authenticate', [email, password])
  return firstNonNull<authentication.Identity>(results)
}

export {
  authenticate
}
