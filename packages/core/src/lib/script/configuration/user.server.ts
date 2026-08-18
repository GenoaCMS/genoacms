import { requirePermission } from '$lib/script/authorization/enforce'
import type { AuthContext } from '$lib/script/authorization/context'
import type { Role } from '$lib/script/authorization/roles'
import type { UserRecord } from '$lib/script/authorization/manifests'
import type { AdministrationResult } from '$lib/script/authorization/administration'
import { isAdministrationLocked } from '$lib/script/authorization/declared.server'
import {
  loadAdministrationState,
  createRole,
  updateRole,
  deleteRole,
  upsertAccount,
  assignAccountRoles,
  removeAccount
} from '$lib/script/authorization/administration.server'

/**
 * The configuration service: administering roles and accounts.
 *
 * `administration.server` is the primary layer and stays unprivileged, matching the split used by
 * storage, database and content. Everything here takes an `AuthContext` first and checks a
 * permission before delegating.
 *
 * Named by the **administrative act** rather than by mechanically prefixing the primitive, because
 * this is the one domain where the convention collides with its own subject matter: a user-faced
 * operation over user records would otherwise be `listUserUsers`. `roles` and `accounts` are what
 * an administrator manipulates, and `User` still marks the operation as one a user performed.
 *
 * ## The Tier-1 lock
 *
 * `security.lockRoles` disables runtime administration entirely, for instances whose authorization
 * should be fixed at deployment. It is checked **after** the permission, so a principal without the
 * permission is told it lacks the permission rather than learning that administration is disabled —
 * and a locked instance reports being locked rather than pretending the operation failed.
 *
 * A refusal here is returned rather than thrown. Being locked is a configuration state an
 * administrator should be shown, not an authorization failure.
 *
 * ## `config:roles:manage` is equivalent to full authority
 *
 * A principal holding it can create a role carrying the wildcard grant and assign it to themselves.
 * **No barrier against that is attempted here, deliberately.** Refusing to grant what the actor does
 * not already hold would be a partial containment: it would still permit delegating existing
 * authority to a new account, and it would prevent an administrator from ever provisioning a
 * SuperAdmin — leaving the Tier-1 seed administrator as the only way to create one.
 *
 * The honest statement is therefore that `config:roles:manage` **is** SuperAdmin by another route,
 * and it should be granted as sparingly as `components:dynamic:commit`. A guard that looked like
 * containment but was not would be worse than the documented truth.
 */

const LOCKED: AdministrationResult<never> = { ok: false, reason: 'administration/locked-by-configuration' }

/** Roles and accounts as they currently stand, for an administration screen. */
const listUserRolesAndAccounts = async (
  ctx: AuthContext
): Promise<AdministrationResult<{ roles: Role[], users: UserRecord[] }>> => {
  // Reading the assignment reveals who holds what, which is administrative information in itself.
  requirePermission(ctx, 'config:roles:manage')
  const state = await loadAdministrationState()
  if (!state.ok) return state
  return { ok: true, value: { roles: state.value.roles, users: state.value.users } }
}

const createUserRole = async (ctx: AuthContext, role: Role): Promise<AdministrationResult<void>> => {
  requirePermission(ctx, 'config:roles:manage')
  if (isAdministrationLocked()) return LOCKED
  return await createRole(role)
}

const updateUserRole = async (ctx: AuthContext, role: Role): Promise<AdministrationResult<void>> => {
  requirePermission(ctx, 'config:roles:manage')
  if (isAdministrationLocked()) return LOCKED
  return await updateRole(role)
}

const deleteUserRole = async (ctx: AuthContext, name: string): Promise<AdministrationResult<void>> => {
  requirePermission(ctx, 'config:roles:manage')
  if (isAdministrationLocked()) return LOCKED
  return await deleteRole(name)
}

const upsertUserAccount = async (
  ctx: AuthContext,
  record: UserRecord
): Promise<AdministrationResult<void>> => {
  requirePermission(ctx, 'config:users:manage')
  if (isAdministrationLocked()) return LOCKED
  return await upsertAccount(record)
}

/**
 * Changes which roles an account holds.
 *
 * Gated on **both** permissions: it is an account operation, and it is also the act that decides
 * what someone may do. A principal who may manage accounts but not roles could otherwise grant any
 * role that exists — which is `config:roles:manage` by another name.
 */
const assignUserAccountRoles = async (
  ctx: AuthContext,
  subject: string,
  names: string[]
): Promise<AdministrationResult<void>> => {
  requirePermission(ctx, 'config:users:manage')
  requirePermission(ctx, 'config:roles:manage')
  if (isAdministrationLocked()) return LOCKED
  return await assignAccountRoles(subject, names)
}

const removeUserAccount = async (
  ctx: AuthContext,
  subject: string
): Promise<AdministrationResult<void>> => {
  requirePermission(ctx, 'config:users:manage')
  if (isAdministrationLocked()) return LOCKED
  return await removeAccount(subject)
}

export {
  listUserRolesAndAccounts,
  createUserRole,
  updateUserRole,
  deleteUserRole,
  upsertUserAccount,
  assignUserAccountRoles,
  removeUserAccount
}
