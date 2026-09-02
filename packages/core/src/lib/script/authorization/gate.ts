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
 * service the element would reach. This exists to keep the interface honest about what it
 * offers, never to secure it — a user who forces a hidden control through gets a denial, not an
 * action.
 */

/**
 * "Any of these", for the one case a conjunction cannot express.
 *
 * Written out rather than given to a bare array, which already means *all* wherever it is used. A
 * form that reads the same but decides the opposite would turn every existing gate into something
 * to be checked by eye.
 */
interface AnyPermission {
  anyOf: Permission[]
}

/** Several permissions mean **all** of them, unless they are wrapped in `anyOf`. */
type PermissionDemand = Permission | Permission[] | AnyPermission

function isDisjunction (demand: PermissionDemand): demand is AnyPermission {
  return typeof demand === 'object' && !Array.isArray(demand)
}

/**
 * Every permission a demand names, whatever shape it took.
 *
 * Exported because the navigation gating is checked against the taxonomy — that each name exists
 * and is instance-scoped — and a second copy of this flattening is how the check and the decision
 * would end up disagreeing about what a demand contains.
 */
const demandedPermissions = (demand: PermissionDemand): Permission[] =>
  isDisjunction(demand) ? demand.anyOf : (Array.isArray(demand) ? demand : [demand])

/**
 * Whether a principal holds what a gate demands.
 *
 * **A list means `and`**, because that is the only form the service layer takes: reverting a page
 * demands content *and* structure editing, publishing demands content editing *and* publish.
 * Offering an element on the weaker of two demands would show a control certain to be refused,
 * which is exactly the dishonesty these gates exist to remove.
 *
 * **`anyOf` is for an index, not for an operation.** A navigation entry leading to several
 * independently gated destinations is useful when any one of them is, and no service call
 * corresponds to it — the destinations behind it are each gated in turn. Using it on a
 * control that performs something would show a button the service is certain to refuse.
 *
 * An empty `anyOf` permits nothing, which is the direction to fail in: a demand naming no
 * permission is a mistake, and showing the element would be the reading that costs something.
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
  const demanded = demandedPermissions(demand)
  const held = hasPermission as (c: AuthContext, p: Permission, r?: string) => boolean
  const holds = (permission: Permission): boolean => held(context, permission, resource)

  try {
    return isDisjunction(demand) ? demanded.some(holds) : demanded.every(holds)
  } catch (error) {
    console.warn(`[genoacms:ui] permission gate for '${demanded.join(', ')}' could not be evaluated`, error)
    return false
  }
}

export {
  demandedPermissions,
  isPermitted
}

export type {
  AnyPermission,
  PermissionDemand
}
