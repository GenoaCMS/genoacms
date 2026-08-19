import { isPermission, getPermissionScope, type Permission, type PermissionScope } from './permissions'

/**
 * A grant is a permission paired with the resource it applies to. Both axes accept a wildcard
 * independently, so a role can hold one permission across every bucket without holding every
 * permission, and can hold every permission over a single collection without holding it globally.
 * A single wildcard could express neither.
 */

const WILDCARD = '*'
type Wildcard = typeof WILDCARD

type PermissionSelector = Permission | Wildcard

/** The kinds of thing a grant can name. Instance-scoped permissions name nothing. */
type ResourceScope = Exclude<PermissionScope, 'instance'>

/**
 * A named resource carries the kind of thing it names, not only its id.
 *
 * An id alone is ambiguous: a bucket and a collection may share a name, and a grant of every
 * permission over the collection `products` must not reach a bucket that happens to be called
 * `products` too. Since a grant may select every permission with a wildcard, the kind cannot
 * always be recovered from the permission, so it is carried here.
 */
interface NamedResource {
  scope: ResourceScope
  id: string
}

/**
 * The resource a grant applies to: one named resource, or `WILDCARD` for every resource of every
 * kind. An instance-scoped permission is only ever granted with `WILDCARD`, since it has no
 * resource to name.
 */
type ResourceSelector = NamedResource | Wildcard

/**
 * Which fields of a collection a grant covers.
 *
 * `WILDCARD` names every field, including ones added to the collection later. An array names
 * exactly the fields listed, so a field added afterwards is **not** among them — a restriction an
 * operator wrote stays as narrow as they wrote it when the schema grows.
 *
 * A grant with no `fields` at all also means every field. That is what every grant written before
 * field selection existed means, and reading it as "no fields" would silently revoke access that
 * was granted. Absence is therefore the unrestricted case, and restriction is always explicit.
 */
type FieldSelector = string[] | Wildcard

/**
 * The permissions a field selection refines.
 *
 * Reading and writing address individual fields; deleting a document does not, so naming fields on
 * a delete grant would describe nothing. Kept as a list rather than a scope on the permission table
 * because it is a property of the grant, not of the permission's resource kind.
 */
const FIELD_SELECTABLE_PERMISSIONS = ['db:collection:read', 'db:collection:write'] as const

const isFieldSelectable = (permission: PermissionSelector): boolean =>
  (FIELD_SELECTABLE_PERMISSIONS as readonly string[]).includes(permission)

interface Grant {
  permission: PermissionSelector
  resource: ResourceSelector
  /**
   * Which fields of the named collection this grant covers. Absent means every field.
   *
   * > **Not yet enforced.** Field-level masking — post-fetch projection on read, field-level merge
   * > on write — is step 17 of the authorization plan and is not built. The service layer currently
   * > ignores this, so a grant naming fields permits the whole document. It is carried and edited
   * > now so that roles composed today survive that step, but until it lands the interface shows a
   * > restriction the system does not apply. This is a **known gap**, recorded rather than implied.
   */
  fields?: FieldSelector
}

/** The grant held by `SuperAdmin`, and by the Tier-1 seed administrator. */
const SUPER_ADMIN_GRANT: Grant = { permission: WILDCARD, resource: WILDCARD }

function isPermissionSelector (value: string): value is PermissionSelector {
  return value === WILDCARD || isPermission(value)
}

function isNamedResource (resource: ResourceSelector): resource is NamedResource {
  return resource !== WILDCARD
}

function selectsPermission (grant: Grant, permission: Permission): boolean {
  return grant.permission === WILDCARD || grant.permission === permission
}

/**
 * Whether a grant satisfies a demand for `permission` over `resource`.
 *
 * `resource` is `undefined` when the demanded permission is instance-scoped. Two ways a naive
 * match would silently over-grant, both handled explicitly here:
 *
 * 1. A grant naming a concrete resource — every permission over the `products` collection — must
 *    not confer an instance-wide permission such as `pages:publish`, which is not scoped to
 *    `products` or to anything else.
 * 2. That same grant must not confer a *bucket* permission over a bucket that happens to share
 *    the name `products`. The kind must match, not only the id.
 *
 * The demanded permission is always concrete, so its scope is known here even when the grant
 * selects every permission.
 */
function grantSatisfies (grant: Grant, permission: Permission, resource?: string): boolean {
  // `grant.fields` is deliberately not consulted: it restricts *which parts* of a document are
  // readable, which is decided by projection and merge at the service layer (step 17), not by
  // whether the operation proceeds. Answering it here would deny the whole operation instead.
  if (!selectsPermission(grant, permission)) return false
  if (!isNamedResource(grant.resource)) return true
  if (resource === undefined) return false
  if (grant.resource.scope !== getPermissionScope(permission)) return false
  return grant.resource.id === resource
}

export {
  WILDCARD,
  SUPER_ADMIN_GRANT,
  FIELD_SELECTABLE_PERMISSIONS,
  isPermissionSelector,
  isNamedResource,
  isFieldSelectable,
  grantSatisfies
}

export type {
  Grant,
  PermissionSelector,
  ResourceSelector,
  ResourceScope,
  NamedResource,
  FieldSelector,
  Wildcard
}
