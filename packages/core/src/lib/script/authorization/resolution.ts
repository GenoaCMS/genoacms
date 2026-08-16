import { composeGrants, type Role } from './roles'
import { createAuthContext, createSeedAdminContext, type AuthContext } from './context'
import type { UserRecord } from './manifests'

/**
 * Resolving a subject to the permissions it holds.
 *
 * Kept free of storage and configuration so the fail-closed rules below are testable directly.
 * A test that says "denies when the manifest is unavailable" is worthless if it cannot also
 * demonstrate that the same code allows when the manifest is present — both directions are
 * exercised here.
 */

/**
 * The authorization data an instance is willing to act upon.
 *
 * `unavailable` covers missing, malformed, and untrusted alike: all three mean the same thing to
 * a resolver that must fail closed, and the reason is carried for the operational alert.
 */
type AuthorizationSource =
  | { available: true, roles: Role[], users: UserRecord[] }
  | { available: false, reason: string }

interface Resolution {
  context: AuthContext
  /** Whether the subject is a principal of this instance at all — the seed admin, or a known user. */
  known: boolean
  /** Conditions worth reporting that did not prevent resolution. */
  warnings: string[]
}

function findUser (users: UserRecord[], subject: string): UserRecord | undefined {
  return users.find(user => user.subject === subject)
}

/**
 * The roles a user names, and the names that resolved to nothing.
 *
 * A dangling reference contributes no grants, so it fails closed on its own; the user keeps
 * whatever else resolved. Denying the user outright would turn deleting a role into an immediate
 * outage for everyone who held it, which is a heavier failure than the data problem warrants.
 */
function resolveRoles (roles: Role[], names: string[]): { resolved: Role[], missing: string[] } {
  const byName = new Map(roles.map(role => [role.name, role]))
  const resolved: Role[] = []
  const missing: string[] = []
  for (const name of names) {
    const role = byName.get(name)
    if (role === undefined) missing.push(name)
    else resolved.push(role)
  }
  return { resolved, missing }
}

function deniedResolution (subject: string, warnings: string[]): Resolution {
  return { context: createAuthContext(subject, []), known: false, warnings }
}

/**
 * Resolves a subject against the instance's authorization data.
 *
 * The seed administrator is decided **before the source is consulted at all**. That is the whole
 * point of siting seed authority in Tier-1 configuration: it is the way back into an instance
 * whose stored authorization is unreadable, and a recovery path that depends on the thing being
 * recovered from is not a recovery path.
 *
 * Every other subject resolves to nothing unless a usable source names it. There is no branch on
 * which an unavailable source yields a permission.
 */
function resolveSubject (subject: string, isSeedAdmin: boolean, source: AuthorizationSource): Resolution {
  if (isSeedAdmin) return { context: createSeedAdminContext(subject), known: true, warnings: [] }

  if (!source.available) {
    return deniedResolution(subject, [`authorization-unavailable: ${source.reason}`])
  }

  const user = findUser(source.users, subject)
  if (user === undefined) return deniedResolution(subject, [])

  const { resolved, missing } = resolveRoles(source.roles, user.roles)
  const warnings = missing.map(name => `unknown-role: '${name}' referenced by subject '${subject}'`)
  return { context: createAuthContext(subject, composeGrants(resolved)), known: true, warnings }
}

export {
  resolveRoles,
  resolveSubject
}

export type {
  AuthorizationSource,
  Resolution
}
