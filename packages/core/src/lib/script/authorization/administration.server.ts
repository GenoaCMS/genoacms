import { isPreconditionFailed } from '@genoacms/cloudabstraction/storage'
import { readSignedDocument } from '$lib/script/signing/signedDocument.server'
import {
  readRawManifest,
  writeSignedManifest,
  rolesManifestPath,
  usersManifestPath,
  ROLES_DOCUMENT,
  USERS_DOCUMENT
} from './manifests.server'
import {
  parseRolesManifest,
  parseUsersManifest,
  serializeRolesManifest,
  serializeUsersManifest,
  type UserRecord
} from './manifests'
import {
  addRole,
  replaceRole,
  removeRole,
  upsertUser,
  setUserRoles,
  removeUser,
  type AdministrationResult
} from './administration'
import type { Role } from './roles'
import { readDeclarations } from './declared.server'
import type { JsonValue } from '$lib/script/signing/canonical'

/**
 * Reading and writing the authorization manifests as an administrator.
 *
 * Separate from `resolution.server`, which reads the same documents to answer "what may this
 * principal do". That path **quarantines and replaces** a manifest it cannot verify, because a
 * request still has to be served. This one must never do that: an administrator editing roles on top
 * of a manifest that failed verification would be writing over evidence, and the empty replacement
 * would silently discard every role. Here an unverifiable manifest is simply refused.
 *
 * Every write is **conditional on the version that was read**. Two administrators editing roles at
 * once would otherwise last-write-wins, and the loser's change would vanish with nothing to say so —
 * the same lost update the key registry needed `ifVersion` to avoid.
 */

interface Loaded<T> {
  value: T
  version?: string
}

async function loadManifest<T> (
  path: string,
  type: typeof ROLES_DOCUMENT | typeof USERS_DOCUMENT,
  parse: (raw: unknown) => { ok: true, value: T } | { ok: false, reason: string }
): Promise<AdministrationResult<Loaded<T>>> {
  let raw
  try {
    raw = await readRawManifest(path)
  } catch {
    return { ok: false, reason: `manifest/unreadable: ${path}` }
  }

  let candidate: unknown
  try {
    candidate = JSON.parse(raw.text)
  } catch {
    return { ok: false, reason: `manifest/not-json: ${path}` }
  }

  const read = await readSignedDocument(candidate, type)
  if (!read.ok) return { ok: false, reason: `manifest/unverified: ${path}: ${read.reason}` }

  const parsed = parse(read.payload)
  if (!parsed.ok) return { ok: false, reason: `manifest/invalid: ${path}: ${parsed.reason}` }

  return { ok: true, value: { value: parsed.value, version: raw.version } }
}

const loadRoles = async (): Promise<AdministrationResult<Loaded<Role[]>>> =>
  await loadManifest(rolesManifestPath, ROLES_DOCUMENT, parseRolesManifest)

const loadUsers = async (): Promise<AdministrationResult<Loaded<UserRecord[]>>> =>
  await loadManifest(usersManifestPath, USERS_DOCUMENT, parseUsersManifest)

/**
 * Both manifests together, since every rule that protects referential integrity needs both.
 *
 * Read as two objects, so they can change between the reads. That is why each is written back with
 * its own version: a role removal validated against a stale user list fails its precondition rather
 * than committing on an assumption that has since become false.
 */
interface AdministrationState {
  /** Stored roles only. Declared ones are not administered here and are never written. */
  roles: Role[]
  users: UserRecord[]
  /** Role names Tier 1 declares, which the rules refuse to alter. */
  declaredRoleNames: Set<string>
  /** Subjects whose assignment Tier 1 declares. */
  declaredSubjects: Set<string>
  rolesVersion?: string
  usersVersion?: string
}

async function loadAdministrationState (): Promise<AdministrationResult<AdministrationState>> {
  const roles = await loadRoles()
  if (!roles.ok) return roles
  const users = await loadUsers()
  if (!users.ok) return users

  const declared = readDeclarations()

  return {
    ok: true,
    value: {
      roles: roles.value.value,
      users: users.value.value,
      declaredRoleNames: new Set(declared.roles.map(role => role.name)),
      declaredSubjects: new Set(declared.users.map(user => user.subject)),
      rolesVersion: roles.value.version,
      usersVersion: users.value.version
    }
  }
}

/** A lost race is reported as a conflict rather than an error: the caller should re-read and retry. */
async function writeManifest (write: () => Promise<void>): Promise<AdministrationResult<void>> {
  try {
    await write()
    return { ok: true, value: undefined }
  } catch (error) {
    if (isPreconditionFailed(error)) return { ok: false, reason: 'manifest/conflict' }
    throw error
  }
}

const saveRoles = async (roles: Role[], expected?: string): Promise<AdministrationResult<void>> =>
  await writeManifest(async () => {
    await writeSignedManifest(
      rolesManifestPath, ROLES_DOCUMENT, serializeRolesManifest(roles) as unknown as JsonValue, expected
    )
  })

const saveUsers = async (users: UserRecord[], expected?: string): Promise<AdministrationResult<void>> =>
  await writeManifest(async () => {
    await writeSignedManifest(
      usersManifestPath, USERS_DOCUMENT, serializeUsersManifest(users) as unknown as JsonValue, expected
    )
  })

/**
 * Applies a rule to the current state and writes the result back conditionally.
 *
 * The rule is pure and the storage is conditional, so a refusal never writes and a lost race never
 * overwrites. Both failure modes come back as an `AdministrationResult` rather than an exception,
 * because both are ordinary outcomes an administrator should be shown.
 */
async function applyToRoles (
  rule: (state: AdministrationState) => AdministrationResult<Role[]>
): Promise<AdministrationResult<void>> {
  const state = await loadAdministrationState()
  if (!state.ok) return state

  const next = rule(state.value)
  if (!next.ok) return next

  return await saveRoles(next.value, state.value.rolesVersion)
}

async function applyToUsers (
  rule: (state: AdministrationState) => AdministrationResult<UserRecord[]>
): Promise<AdministrationResult<void>> {
  const state = await loadAdministrationState()
  if (!state.ok) return state

  const next = rule(state.value)
  if (!next.ok) return next

  return await saveUsers(next.value, state.value.usersVersion)
}

const createRole = async (role: Role): Promise<AdministrationResult<void>> =>
  await applyToRoles(state => addRole(state.roles, role, state.declaredRoleNames))

const updateRole = async (role: Role): Promise<AdministrationResult<void>> =>
  await applyToRoles(state => replaceRole(state.roles, role, state.declaredRoleNames))

const deleteRole = async (name: string): Promise<AdministrationResult<void>> =>
  await applyToRoles(state => removeRole(state.roles, state.users, name, state.declaredRoleNames))

const upsertAccount = async (record: UserRecord): Promise<AdministrationResult<void>> =>
  await applyToUsers(state => upsertUser(state.users, state.roles, record, state.declaredSubjects))

const assignAccountRoles = async (subject: string, names: string[]): Promise<AdministrationResult<void>> =>
  await applyToUsers(state => setUserRoles(state.users, state.roles, subject, names, state.declaredSubjects))

const removeAccount = async (subject: string): Promise<AdministrationResult<void>> =>
  await applyToUsers(state => removeUser(state.users, subject, state.declaredSubjects))

export {
  loadRoles,
  loadUsers,
  loadAdministrationState,
  createRole,
  updateRole,
  deleteRole,
  upsertAccount,
  assignAccountRoles,
  removeAccount
}

export type {
  AdministrationState
}
