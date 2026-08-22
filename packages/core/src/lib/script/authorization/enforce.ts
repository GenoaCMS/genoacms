import {
  permissions,
  isResourceScoped,
  getPermissionScope,
  type Permission,
  type InstancePermission,
  type ResourceScopedPermission
} from './permissions'
import { WILDCARD, grantSatisfies } from './grants'
import type { ResourceScope } from './grants'
import type { AuthContext } from './context'

/**
 * Raised when a principal lacks a demanded permission. Route and action layers map this to 403;
 * every other error is a fault and maps to 500. The distinction matters — a misused check must
 * not be reported to the user as a denial, and a denial must not be reported as a server fault.
 */
class PermissionDeniedError extends Error {
  readonly subject: string
  readonly permission: Permission
  readonly resource?: string

  constructor (subject: string, permission: Permission, resource?: string) {
    const target = resource === undefined ? permission : `${permission} on '${resource}'`
    super(`permission-denied: '${subject}' lacks ${target}`)
    this.name = 'PermissionDeniedError'
    this.subject = subject
    this.permission = permission
    this.resource = resource
  }
}

/**
 * Rejects a check whose resource argument does not match the demanded permission's scope.
 *
 * The overloads below make this a compile error for TypeScript callers; this is the runtime
 * backstop for callers that are not type-checked. It throws rather than guessing, because every
 * available guess is wrong: treating a missing resource as "any resource" would over-grant, and
 * treating it as "no resource" would silently check something other than what was asked.
 */
function assertResourceMatchesScope (permission: Permission, resource?: string): void {
  if (isResourceScoped(permission)) {
    if (resource === undefined) {
      throw new Error(`permission-check-missing-resource: '${permission}' is scoped per ${getPermissionScope(permission)}`)
    }
    if (resource === WILDCARD) {
      throw new Error(`permission-check-wildcard-resource: '${permission}' must be checked against a named resource`)
    }
    if (resource === '') {
      throw new Error(`permission-check-empty-resource: '${permission}' must be checked against a named resource`)
    }
    return
  }
  if (resource !== undefined) {
    throw new Error(`permission-check-unexpected-resource: '${permission}' is instance-scoped`)
  }
}

/**
 * Whether the principal holds a permission.
 *
 * **Presentation only.** This is for adapting the UI — hiding a button the user cannot use. It
 * returns a boolean, so ignoring the answer is silent, which is exactly what must not happen at a
 * service boundary. Services call `requirePermission`.
 */
function hasPermission (context: AuthContext, permission: InstancePermission): boolean
function hasPermission (context: AuthContext, permission: ResourceScopedPermission, resource: string): boolean
function hasPermission (context: AuthContext, permission: Permission, resource?: string): boolean {
  assertResourceMatchesScope(permission, resource)
  return context.grants.some(grant => grantSatisfies(grant, permission, resource))
}

/**
 * Whether the principal holds **any** permission of one resource scope over one resource.
 *
 * This is the question a *catalogue* asks: the bucket catalogue is filtered over any bucket-scoped
 * grant rather than `read` alone, because a principal holding only
 * `storage:bucket:write` must still see the bucket as an upload target. Filtering on `read` would
 * hide the destination of an upload the same principal is permitted to perform.
 *
 * It is not a weaker check than `requirePermission`, because it decides a different thing: whether a
 * name appears in a list, not whether an operation proceeds. Every operation on the listed resource
 * is demanded separately when it is attempted.
 *
 * Derived from the permission table rather than from a hand-written list, so a permission added to a
 * scope is included here by construction rather than by someone remembering to add it.
 */
function hasAnyPermissionOn (context: AuthContext, scope: ResourceScope, resource: string): boolean {
  return permissions.some(permission =>
    isResourceScoped(permission) &&
    getPermissionScope(permission) === scope &&
    hasPermission(context, permission, resource)
  )
}

/**
 * Demands a permission, throwing `PermissionDeniedError` when it is not held.
 *
 * It returns nothing by design: a check whose result can be ignored is a check that will be
 * ignored. This is the only form used at a service boundary.
 */
function requirePermission (context: AuthContext, permission: InstancePermission): void
function requirePermission (context: AuthContext, permission: ResourceScopedPermission, resource: string): void
function requirePermission (context: AuthContext, permission: Permission, resource?: string): void {
  // Delegates to the same matcher the UI uses, so the two can never disagree about what is held.
  const isHeld = (hasPermission as (c: AuthContext, p: Permission, r?: string) => boolean)(context, permission, resource)
  if (!isHeld) throw new PermissionDeniedError(context.subject, permission, resource)
}

export {
  PermissionDeniedError,
  hasPermission,
  hasAnyPermissionOn,
  requirePermission
}
