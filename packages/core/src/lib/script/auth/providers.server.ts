import { host } from '$lib/script/host.server'
import type { Identity } from '@genoacms/contracts/authentication'
import { callProvidersFunction, firstNonNull } from '../providers.server'

async function authenticate (email: string, password: string): Promise<Identity | null> {
  const authenticationProviders = await host.authenticationProviders()
  const results = await callProvidersFunction(authenticationProviders, 'authenticate', [email, password])
  return firstNonNull<Identity>(results)
}

export {
  authenticate
}
