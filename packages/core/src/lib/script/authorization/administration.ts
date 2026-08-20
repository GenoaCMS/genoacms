import { SUPER_ADMIN_ROLE_NAME, type Role } from './roles'
import type { UserRecord } from './manifests'

/**
 * Administering roles and users: the rules, without storage.
 *
 * These decide what an administrator may do to the authorization data itself, which makes them the
 * rules that govern every other rule. They are pure so the invariants can be tested without a
 * bucket, a signing key, or a request.
 *
 * Two invariants are enforced here.
 *
 * **Tier-1 declarations are immutable.** A role or assignment declared in configuration cannot be
 * altered or removed at runtime, and a runtime entry cannot be created under a declared name. The
 * refusal happens when the change is attempted rather than by reverting it later: reapplying
 * declarations at startup would let an administrator edit a declared role, watch it work, and find
 * it undone after the next deployment with nothing having explained why.
 *
 * The second is **referential integrity**: a user must never name a role that does
 * not exist. `resolveSubject` tolerates a dangling reference by warning and resolving the rest,
 * because at *read* time refusing would be a lockout. At *write* time there is no such excuse — the
 * administrator is here, and can be told.
 */

type AdministrationResult<T> =
  | { ok: true, value: T }
  | { ok: false, reason: string }

const findRole = (roles: Role[], name: string): Role | undefined =>
  roles.find(role => role.name === name)

const findUser = (users: UserRecord[], subject: string): UserRecord | undefined =>
  users.find(user => user.subject === subject)

/** Users still naming a role, which is what makes removing it unsafe. */
const holdersOf = (users: UserRecord[], name: string): string[] =>
  users.filter(user => user.roles.includes(name)).map(user => user.subject)

function addRole (roles: Role[], role: Role, declared: Set<string>): AdministrationResult<Role[]> {
  if (role.name.length === 0) return { ok: false, reason: 'role/name-empty' }
  // A runtime role under a declared name would be discarded by the merge and never take effect.
  // Refusing says so, where accepting would store something that silently does nothing.
  if (declared.has(role.name)) return { ok: false, reason: 'role/declared-in-configuration' }
  if (findRole(roles, role.name) !== undefined) return { ok: false, reason: 'role/already-exists' }
  return { ok: true, value: [...roles, role] }
}

/**
 * Replaces a role's grants.
 *
 * `SuperAdmin` is refused. It is the role the instance provisions on first run, and the one an
 * administrator recovers through; letting it be narrowed would allow an instance to be left with no
 * principal holding full authority — recoverable only through the Tier-1 seed administrator, which
 * is a recovery path, not a management strategy.
 */
function replaceRole (roles: Role[], role: Role, declared: Set<string>): AdministrationResult<Role[]> {
  if (declared.has(role.name)) return { ok: false, reason: 'role/declared-in-configuration' }
  if (role.name === SUPER_ADMIN_ROLE_NAME) return { ok: false, reason: 'role/super-admin-immutable' }
  if (findRole(roles, role.name) === undefined) return { ok: false, reason: 'role/not-found' }
  return { ok: true, value: roles.map(existing => existing.name === role.name ? role : existing) }
}

/**
 * Removes a role.
 *
 * Refused while any user still holds it, rather than cascading. Silently stripping a role from
 * accounts would change what those people can do as a side effect of an unrelated action, and the
 * administrator would have no record of whose authority just narrowed.
 */
function removeRole (
  roles: Role[],
  users: UserRecord[],
  name: string,
  declared: Set<string>
): AdministrationResult<Role[]> {
  // Declared roles are removed by deleting the declaration, which revokes them everywhere at once.
  if (declared.has(name)) return { ok: false, reason: 'role/declared-in-configuration' }
  if (name === SUPER_ADMIN_ROLE_NAME) return { ok: false, reason: 'role/super-admin-immutable' }
  if (findRole(roles, name) === undefined) return { ok: false, reason: 'role/not-found' }

  const holders = holdersOf(users, name)
  if (holders.length > 0) {
    return { ok: false, reason: `role/in-use: held by ${holders.join(', ')}` }
  }
  return { ok: true, value: roles.filter(role => role.name !== name) }
}

const unknownRoles = (roles: Role[], names: string[]): string[] =>
  names.filter(name => findRole(roles, name) === undefined)

function validateAssignment (roles: Role[], names: string[]): AdministrationResult<string[]> {
  const duplicates = names.length !== new Set(names).size
  if (duplicates) return { ok: false, reason: 'user/duplicate-roles' }

  const unknown = unknownRoles(roles, names)
  if (unknown.length > 0) return { ok: false, reason: `user/unknown-roles: ${unknown.join(', ')}` }
  return { ok: true, value: names }
}

/** Adds a user, or replaces the record for a subject already present. */
function upsertUser (
  users: UserRecord[],
  roles: Role[],
  record: UserRecord,
  declared: Set<string>
): AdministrationResult<UserRecord[]> {
  if (record.subject.length === 0) return { ok: false, reason: 'user/subject-empty' }
  if (declared.has(record.subject)) return { ok: false, reason: 'user/declared-in-configuration' }

  const assignment = validateAssignment(roles, record.roles)
  if (!assignment.ok) return assignment

  const existing = findUser(users, record.subject)
  if (existing === undefined) return { ok: true, value: [...users, record] }
  return { ok: true, value: users.map(user => user.subject === record.subject ? record : user) }
}

function setUserRoles (
  users: UserRecord[],
  roles: Role[],
  subject: string,
  names: string[],
  declared: Set<string>
): AdministrationResult<UserRecord[]> {
  // The declared assignment is the authority for this subject; changing it here would produce a
  // stored record the merge then discards.
  if (declared.has(subject)) return { ok: false, reason: 'user/declared-in-configuration' }
  const user = findUser(users, subject)
  if (user === undefined) return { ok: false, reason: 'user/not-found' }

  const assignment = validateAssignment(roles, names)
  if (!assignment.ok) return assignment

  return {
    ok: true,
    value: users.map(existing => existing.subject === subject ? { ...existing, roles: names } : existing)
  }
}

/**
 * Removes a user.
 *
 * No check for "the last administrator" is made here, and that is deliberate: the Tier-1 seed
 * administrator is resolved from configuration without consulting these manifests, so an instance
 * cannot be locked out by emptying them. Inventing a last-admin rule would add a special case that
 * protects against something the architecture already prevents.
 */
function removeUser (
  users: UserRecord[],
  subject: string,
  declared: Set<string>
): AdministrationResult<UserRecord[]> {
  if (declared.has(subject)) return { ok: false, reason: 'user/declared-in-configuration' }
  if (findUser(users, subject) === undefined) return { ok: false, reason: 'user/not-found' }
  return { ok: true, value: users.filter(user => user.subject !== subject) }
}

export {
  addRole,
  replaceRole,
  removeRole,
  upsertUser,
  setUserRoles,
  removeUser,
  holdersOf
}

export type {
  AdministrationResult
}
