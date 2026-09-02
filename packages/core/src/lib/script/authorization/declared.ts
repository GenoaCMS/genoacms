import { parseRolesManifest, parseUsersManifest, type UserRecord } from './manifests'
import type { Role } from './roles'

/**
 * Tier-1 declarations, and their merge with what runtime administration has stored.
 *
 * The two-tier rule: anything settable in Tier 2 is settable in Tier 1, and **a Tier-1
 * declaration is immutable at runtime** — an attempt to change it is refused when it is made rather
 * than reverted at the next start.
 *
 * **Declarations are merged when the state is read, never written into the manifests.** That is what
 * makes deleting a line from `genoa.config` revoke the access it granted: nothing was persisted, so
 * there is nothing left behind to keep honoring. Writing them into `roles.json` would instead
 * require a reconciliation pass at startup to delete entries whose declaration had disappeared —
 * the reconcile-at-boot behavior that rule 5 exists to avoid.
 *
 * Provenance therefore needs no flag on the records themselves: an entry is declared if Tier 1 names
 * it, and stored otherwise. `declaredRoleNames` and `declaredSubjects` carry that, so the pure
 * administration rules can refuse a change without knowing where configuration comes from.
 */

/** Roles and users as resolution and administration see them, with provenance alongside. */
interface MergedAuthorization {
  roles: Role[]
  users: UserRecord[]
  /** Role names Tier 1 declares. Immutable at runtime. */
  declaredRoleNames: Set<string>
  /** Subjects whose assignment Tier 1 declares. Immutable at runtime. */
  declaredSubjects: Set<string>
}

type DeclarationResult<T> =
  | { ok: true, value: T }
  | { ok: false, reason: string }

interface Declarations {
  roles: Role[]
  users: UserRecord[]
}

/**
 * Parses the Tier-1 declarations.
 *
 * Reuses the manifest parsers rather than a second validator, so a role means exactly the same thing
 * whether it was declared or administered. A malformed declaration is an error and never a skip: it
 * is configuration an operator wrote deliberately, and ignoring it would leave an instance with less
 * authority than its configuration describes and nothing to say so.
 */
function parseDeclarations (
  roles: unknown,
  assignments: unknown
): DeclarationResult<Declarations> {
  const parsedRoles = parseRolesManifest({ roles: roles ?? {} })
  if (!parsedRoles.ok) {
    return { ok: false, reason: `authorization.roles is not valid: ${parsedRoles.reason}` }
  }

  // Assignments are shaped as the users manifest is, minus the email a declaration has no way to
  // know. The parser is shared, so a declared assignment cannot mean something a stored one cannot.
  //
  // Null-prototype, as `serializeUsersManifest` is: on a plain object, assigning `__proto__` sets
  // the prototype instead of creating a key, so such a declaration would vanish here and reach the
  // parser's unsafe-key guard as an empty object — silently ignored rather than refused.
  const users: Record<string, unknown> = Object.create(null)
  for (const [subject, names] of Object.entries((assignments ?? {}) as Record<string, unknown>)) {
    users[subject] = { email: '', roles: names }
  }

  const parsedUsers = parseUsersManifest({ users })
  if (!parsedUsers.ok) {
    return { ok: false, reason: `authorization.assignments is not valid: ${parsedUsers.reason}` }
  }

  return { ok: true, value: { roles: parsedRoles.value, users: parsedUsers.value } }
}

/**
 * Merges declarations over stored state.
 *
 * A declared name always wins. A stored entry of the same name should not exist — nothing writes
 * one, and administration refuses to create it — but if one is found it is discarded rather than
 * merged, so a manifest edited out of band cannot dilute a declaration.
 */
function mergeDeclarations (declared: Declarations, stored: Declarations): MergedAuthorization {
  const declaredRoleNames = new Set(declared.roles.map(role => role.name))
  const declaredSubjects = new Set(declared.users.map(user => user.subject))

  return {
    roles: [
      ...declared.roles,
      ...stored.roles.filter(role => !declaredRoleNames.has(role.name))
    ],
    users: [
      ...declared.users,
      ...stored.users.filter(user => !declaredSubjects.has(user.subject))
    ],
    declaredRoleNames,
    declaredSubjects
  }
}

/** The names Tier 1 declares, which the administration rules refuse to alter. */
const declaredRoleNames = (declared: Declarations): Set<string> =>
  new Set(declared.roles.map(role => role.name))

const declaredSubjects = (declared: Declarations): Set<string> =>
  new Set(declared.users.map(user => user.subject))

/** The declarations alone, for an instance whose stored authorization cannot be read. */
const declarationsOnly = (declared: Declarations): MergedAuthorization =>
  mergeDeclarations(declared, { roles: [], users: [] })

export {
  parseDeclarations,
  mergeDeclarations,
  declarationsOnly,
  declaredRoleNames,
  declaredSubjects
}

export type {
  Declarations,
  MergedAuthorization,
  DeclarationResult
}
