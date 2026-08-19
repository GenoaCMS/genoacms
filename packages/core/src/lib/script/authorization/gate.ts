import { hasPermission } from './enforce'
import type { Permission } from './permissions'
import type { AuthContext } from './context'

/**
 * The decision behind the interface's permission gates.
 *
 * Pure and separate from the component so it can be tested without rendering anything, and so the
 * one place that decides what a gate shows is shared by every screen.
 *
 * **Cosmetic, and only cosmetic.** Every element a gate hides is independently refused by the
 * service the element would reach (§4.2.6). This exists to keep the interface honest about what it
 * offers, never to secure it — a user who forces a hidden control through gets a denial, not an
 * action.
 */

/** Several permissions mean **all** of them, never any of them. */
type PermissionDemand = Permission | Permission[]

/**
 * Whether a principal holds everything a gate demands.
 *
 * `and` rather than `or` because that is the only form the service layer takes: reverting a page
 * demands content *and* structure editing, publishing demands content editing *and* publish.
 * Offering an element on the weaker of two demands would show a control certain to be refused,
 * which is exactly the dishonesty these gates exist to remove.
 *
 * **Fails closed rather than throwing.** `hasPermission` refuses a resource-scoped permission
 * checked without a resource, which is a programming error — but raising it here would take out the
 * surrounding view over a hidden button. Hiding and warning degrades the interface; throwing
 * removes it.
 */
function isPermitted (
  context: AuthContext,
  demand: PermissionDemand,
  resource?: string
): boolean {
  const demanded = Array.isArray(demand) ? demand : [demand]
  const held = hasPermission as (c: AuthContext, p: Permission, r?: string) => boolean

  try {
    return demanded.every(permission => held(context, permission, resource))
  } catch (error) {
    console.warn(`[genoacms:ui] permission gate for '${demanded.join(', ')}' could not be evaluated`, error)
    return false
  }
}

export {
  isPermitted
}

export type {
  PermissionDemand
}
