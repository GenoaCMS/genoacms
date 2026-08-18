import type { Grant } from './grants'

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
   * Whether this authority was resolved from Tier-1 declarations alone, the stored authorization
   * being unreadable.
   *
   * The matcher does not consult it: a declared principal holds ordinary grants and is matched by
   * the same single code path as everyone else, so declared authority cannot drift away from normal
   * matching. It is recorded so that **recovery mode** — an instance whose manifests are absent or
   * failed verification — is distinguishable from ordinary operation, which the fail-closed
   * operational alert needs to report.
   */
  fromDeclarationsOnly: boolean
}

function createAuthContext (subject: string, grants: Grant[], fromDeclarationsOnly = false): AuthContext {
  return { subject, grants, fromDeclarationsOnly }
}

export {
  createAuthContext
}

export type {
  AuthContext
}
