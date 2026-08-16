import { loadOrBootstrapRegistry } from '$lib/script/signing/registry.server'
import { loadAuthorizationSource } from '$lib/script/authorization/resolution.server'
import { loadSecurityPolicy } from '$lib/script/securityPolicy/policy.server'

/**
 * What an instance must have in place before it serves anything.
 *
 * Every step below is otherwise reached only by a request that happens to need it — and on an
 * instance whose only user is the seed administrator, no request ever does. That identity resolves
 * from Tier-1 configuration without consulting storage, deliberately, so recovery does not depend
 * on the bucket being readable. The consequence is that a fresh instance would run indefinitely
 * with no root key, no registry and no manifests, and nothing to say so.
 *
 * The circularity is worse than the omission: the manifests would be created by the first ordinary
 * user's login, and that login is rejected because `users.json` does not yet name them. The only
 * thing that would have created them is a login that fails regardless.
 *
 * Each step is idempotent and conditional, so restarting is a no-op and instances starting together
 * converge rather than conflict.
 */

let initialised: Promise<void> | undefined

async function initialise (): Promise<void> {
  // Creates the root key on the way, since signing the registry requires it.
  await loadOrBootstrapRegistry()
  // Creates the security policy document from Tier-1 defaults, if absent.
  await loadSecurityPolicy()
  // Creates roles.json and users.json, empty and signed, if they are absent.
  await loadAuthorizationSource()
}

/**
 * Runs initialisation once per process.
 *
 * **Never rejects.** A failure here means the bucket or the secret store is unreachable or
 * misconfigured, and refusing to start would remove the only route to repairing it — the seed
 * administrator has to be able to sign in. The condition is reported instead, and the next attempt
 * happens on the next start.
 */
async function ensureInstanceInitialised (): Promise<void> {
  if (initialised === undefined) {
    initialised = initialise().catch((error: unknown) => {
      console.error(
        '[genoacms:bootstrap] initialisation failed, so signing keys or authorization manifests may ' +
        'be missing. The seed administrator can still sign in to repair this. ' +
        `Cause: ${(error as Error).message}`
      )
    })
  }
  await initialised
}

export {
  ensureInstanceInitialised
}
