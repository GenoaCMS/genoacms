import { SUPER_ADMIN_GRANT, type Grant } from './grants'

/**
 * The authorization context of a single principal.
 *
 * Grants are resolved once — at login or token refresh — and carried here, so an ordinary
 * permission check performs no I/O. The context is threaded explicitly through service functions
 * rather than read from ambient state, which is what makes omitting it a type error instead of an
 * unauthenticated call that happens to succeed.
 */
interface AuthContext {
  subject: string
  grants: Grant[]
  /**
   * Whether this authority came from Tier-1 configuration rather than a stored manifest.
   *
   * The matcher does not consult this: a seed administrator holds an ordinary wildcard grant and
   * is matched by the same single code path as everyone else, so seed authority cannot drift away
   * from normal matching. It is recorded so that recovery mode — an instance whose manifests are
   * absent or failed verification — is distinguishable from a genuinely provisioned SuperAdmin,
   * which the fail-closed operational alert needs to report.
   */
  isSeedAdmin: boolean
}

function createAuthContext (subject: string, grants: Grant[]): AuthContext {
  return { subject, grants, isSeedAdmin: false }
}

/**
 * The context of the Tier-1 seed administrator, authorized without consulting any manifest.
 */
function createSeedAdminContext (subject: string): AuthContext {
  return { subject, grants: [SUPER_ADMIN_GRANT], isSeedAdmin: true }
}

export {
  createAuthContext,
  createSeedAdminContext
}

export type {
  AuthContext
}
