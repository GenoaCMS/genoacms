import { SUPER_ADMIN_GRANT, type Grant } from './grants'

/**
 * Roles are freely composable: a role is a name and a set of grants, with no fixed hierarchy and
 * no built-in role beyond `SuperAdmin`. A principal holds several roles and the union of their
 * grants.
 */
interface Role {
  name: string
  grants: Grant[]
}

const SUPER_ADMIN_ROLE_NAME = 'SuperAdmin'

/**
 * The role provisioned on first run. It is an ordinary role holding the wildcard grant, not a
 * special case in the matcher — so the permissions of an administrator are inspectable in the
 * same terms as everyone else's.
 */
const superAdminRole: Role = {
  name: SUPER_ADMIN_ROLE_NAME,
  grants: [SUPER_ADMIN_GRANT]
}

function grantKey (grant: Grant): string {
  // A resource id may itself contain a separator, so the key is built structurally rather than
  // by concatenation, which could otherwise collide two distinct grants into one.
  return JSON.stringify([grant.permission, grant.resource])
}

/**
 * The union of the grants of several roles, with exact duplicates removed.
 *
 * Duplicates are harmless to matching but not to size: resolved grants travel inside the access
 * token, so overlapping roles would inflate every request. Grants subsumed by a wildcard are left
 * in place — collapsing them would make the token no longer show which role conferred what.
 */
function composeGrants (roles: Role[]): Grant[] {
  const byKey = new Map<string, Grant>()
  for (const role of roles) {
    for (const grant of role.grants) {
      byKey.set(grantKey(grant), grant)
    }
  }
  return [...byKey.values()]
}

export {
  SUPER_ADMIN_ROLE_NAME,
  superAdminRole,
  composeGrants
}

export type {
  Role
}
