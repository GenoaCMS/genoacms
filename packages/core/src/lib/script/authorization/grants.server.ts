import { GrantCache } from './grantCache'
import { resolvePrincipal } from './resolution.server'
import { loadSecurityPolicy } from '$lib/script/securityPolicy/policy.server'
import type { AuthContext } from './context'

/**
 * The authorization context for a request.
 *
 * The session token carries identity only, so grants are resolved here and held per subject for the
 * window the security policy states. That window is how long a revoked permission is still
 * honored, which is why it is policy rather than a constant.
 */

let cache: GrantCache | undefined

/**
 * Built on first use rather than at import, because the cache window comes from the signed policy
 * document — which cannot be read before the instance has bootstrapped.
 */
async function getCache (): Promise<GrantCache> {
  if (cache === undefined) {
    const policy = await loadSecurityPolicy()
    cache = new GrantCache(resolvePrincipal, { ttlSeconds: policy.grantCacheSeconds })
  }
  return cache
}

/** The context for an authenticated subject, or `undefined` if it is not a principal here. */
async function getAuthContext (subject: string): Promise<AuthContext | undefined> {
  const resolution = await (await getCache()).get(subject)
  return resolution.known ? resolution.context : undefined
}

/** Called after this instance changes a user's roles, so the change is not delayed by the window. */
async function forgetSubject (subject: string): Promise<void> {
  (await getCache()).forget(subject)
}

/** Called after this instance changes the roles themselves, which can affect every subject. */
async function forgetAllSubjects (): Promise<void> {
  (await getCache()).clear()
}

export {
  getAuthContext,
  forgetSubject,
  forgetAllSubjects
}
