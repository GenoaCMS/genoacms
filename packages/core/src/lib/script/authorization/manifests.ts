import { validator, type Json } from '@exodus/schemasafe'
import { rolesManifestSchema, usersManifestSchema } from './manifestSchemas'
import type { Grant } from './grants'
import type { Role } from './roles'

/**
 * Parsing of the authorization manifests, separated from the storage that holds them so the
 * rules below are testable without a bucket.
 *
 * Every function here fails closed: an invalid manifest yields no roles and no users at all,
 * never a partial set. Salvaging the valid half of a tampered manifest would be exactly the
 * behaviour an attacker with bucket write access would want.
 */

/** A CMS user. Keyed by `subject`; `email` is display metadata and is never authorization input. */
interface UserRecord {
  subject: string
  email: string
  roles: string[]
}

type ManifestParseResult<T> =
  | { ok: true, value: T }
  | { ok: false, reason: string }

interface RolesManifestJSON {
  roles: Record<string, Grant[]>
}

interface UsersManifestJSON {
  users: Record<string, { email: string, roles: string[] }>
}

const validateRolesManifest = validator(rolesManifestSchema, { includeErrors: true })
const validateUsersManifest = validator(usersManifestSchema, { includeErrors: true })

/**
 * Keys that are dangerous to use as object keys. Manifest keys are attacker-influenced strings,
 * and `JSON.parse` yields `__proto__` as an own property that later assignment could turn into
 * prototype pollution. Rejecting them costs nothing — no legitimate role or subject is named this.
 */
const unsafeKeys = new Set(['__proto__', 'constructor', 'prototype'])

function findUnsafeKey (keys: string[]): string | undefined {
  return keys.find(key => unsafeKeys.has(key))
}

function describeErrors (errors: unknown): string {
  return JSON.stringify(errors ?? [])
}

/**
 * The validators are typed for JSON, but manifest content arrives as `unknown` — it is whatever
 * was in the bucket. The cast is confined to this one boundary, and the validators reject
 * non-JSON values rather than trusting the assertion.
 */
function asJson (raw: unknown): Json {
  return raw as Json
}

function parseRolesManifest (raw: unknown): ManifestParseResult<Role[]> {
  if (!validateRolesManifest(asJson(raw))) {
    return { ok: false, reason: `roles-manifest-malformed: ${describeErrors(validateRolesManifest.errors)}` }
  }
  const { roles } = raw as RolesManifestJSON
  const names = Object.keys(roles)
  const unsafe = findUnsafeKey(names)
  if (unsafe !== undefined) return { ok: false, reason: `roles-manifest-unsafe-role-name: ${unsafe}` }

  return { ok: true, value: names.map(name => ({ name, grants: roles[name] })) }
}

function parseUsersManifest (raw: unknown): ManifestParseResult<UserRecord[]> {
  if (!validateUsersManifest(asJson(raw))) {
    return { ok: false, reason: `users-manifest-malformed: ${describeErrors(validateUsersManifest.errors)}` }
  }
  const { users } = raw as UsersManifestJSON
  const subjects = Object.keys(users)
  const unsafe = findUnsafeKey(subjects)
  if (unsafe !== undefined) return { ok: false, reason: `users-manifest-unsafe-subject: ${unsafe}` }

  return {
    ok: true,
    value: subjects.map(subject => ({ subject, email: users[subject].email, roles: users[subject].roles }))
  }
}

/**
 * The stored form of a role set. Roles sharing a name collapse into one, which the keyed schema
 * makes unrepresentable on the way back in.
 */
function serializeRolesManifest (roles: Role[]): RolesManifestJSON {
  const stored: Record<string, Grant[]> = Object.create(null)
  for (const role of roles) {
    stored[role.name] = role.grants
  }
  return { roles: stored }
}

function serializeUsersManifest (users: UserRecord[]): UsersManifestJSON {
  const stored: UsersManifestJSON['users'] = Object.create(null)
  for (const user of users) {
    stored[user.subject] = { email: user.email, roles: user.roles }
  }
  return { users: stored }
}

export {
  parseRolesManifest,
  parseUsersManifest,
  serializeRolesManifest,
  serializeUsersManifest
}

export type {
  UserRecord,
  ManifestParseResult,
  RolesManifestJSON,
  UsersManifestJSON
}
