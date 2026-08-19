import { requirePermission } from '$lib/script/authorization/enforce'
import type { AuthContext } from '$lib/script/authorization/context'
import type { Role } from '$lib/script/authorization/roles'
import type { UserRecord } from '$lib/script/authorization/manifests'
import type { AdministrationResult } from '$lib/script/authorization/administration'
import { isAdministrationLocked } from '$lib/script/authorization/declared.server'
import { getBucketReferences } from '$lib/script/storage/storage.server'
import { getCollectionReferences } from '$lib/script/database/database.server'
import type { GrantableResources } from './resources'
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

/**
 * One entry as an administration screen needs to see it.
 *
 * `editable` is the answer to "may this be changed here", and it is computed once, on the server,
 * from the same facts the write path checks. An interface that decided for itself would eventually
 * disagree with the rules and offer a control that is certain to be refused.
 */
interface AdministrableRole {
  role: Role
  editable: boolean
}

interface AdministrableAccount {
  account: UserRecord
  editable: boolean
}

interface AdministrationView {
  /** Declared and stored roles together. A screen showing only stored ones would misrepresent the instance. */
  roles: AdministrableRole[]
  accounts: AdministrableAccount[]
  /** True when `security.lockRoles` disables runtime administration entirely. */
  locked: boolean
}

/**
 * Roles and accounts as they currently stand, for an administration screen.
 *
 * **Declared entries are included and marked uneditable**, rather than omitted. Omitting them would
 * show a fresh instance as having no roles while a Tier-1 declaration was governing it, and would
 * leave an administrator unable to see why a subject has authority.
 */
const listUserRolesAndAccounts = async (
  ctx: AuthContext
): Promise<AdministrationResult<AdministrationView>> => {
  // Reading the assignment reveals who holds what, which is administrative information in itself.
  requirePermission(ctx, 'config:roles:manage')

  const state = await loadAdministrationState()
  if (!state.ok) return state

  // Nothing is editable on a locked instance, declared or not.
  const locked = isAdministrationLocked()
  const editable = !locked

  return {
    ok: true,
    value: {
      roles: [
        ...state.value.declared.roles.map(role => ({ role, editable: false })),
        ...state.value.roles.map(role => ({ role, editable }))
      ],
      accounts: [
        ...state.value.declared.users.map(account => ({ account, editable: false })),
        ...state.value.users.map(account => ({ account, editable }))
      ],
      locked
    }
  }
}

/**
 * The buckets and collections a resource-scoped grant can name.
 *
 * Names only — no endpoint, no credential, no content. A grant over a bucket is not a decision until
 * the bucket is named (§4.2.2), and an administrator composing one previously had to type the name
 * with nothing checking it, so a typo produced a grant that silently never matched.
 *
 * ## Why `config:roles:manage` and not a storage or database permission
 *
 * This is a **disclosure decision**, and it is the widest of the three considered. A role
 * administrator commonly holds no storage or database grant at all, so filtering the catalogue by the
 * caller's own access — as the storage and database services do for their own navigation — would show
 * them an empty picker and force them back to typing.
 *
 * What makes the wider rule defensible is stated plainly above: `config:roles:manage` **is**
 * SuperAdmin by another route. A holder can grant themselves every permission over every resource and
 * read the catalogue that way in one step, so withholding the names conceals nothing from them. It
 * conceals the names only from principals who cannot obtain them anyway.
 *
 * A dedicated `config:resources:list` permission was rejected on the same grounds §4.2.2 rejects
 * `storage:bucket:list`: it would decide nothing that `config:roles:manage` does not already decide.
 *
 * The bucket list is Tier-1 configuration and therefore complete. The collection list is read once at
 * startup by the primary database module, so a collection created since is absent until restart —
 * which is why a grant may still name every collection rather than one.
 */
const listGrantableResources = (ctx: AuthContext): GrantableResources => {
  requirePermission(ctx, 'config:roles:manage')

  return {
    buckets: getBucketReferences().map(bucket => bucket.name),
    collections: getCollectionReferences()
  }
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
  listGrantableResources,
  createUserRole,
  updateUserRole,
  deleteUserRole,
  upsertUserAccount,
  assignUserAccountRoles,
  removeUserAccount
}

export type {
  GrantableResources
}

