import {
  isResourceScoped,
  getResourceScope,
  type Permission,
  type ResourceScopedPermission
} from '$lib/script/authorization/permissions'
import { WILDCARD, isFieldSelectable, type Grant, type FieldSelector } from '$lib/script/authorization/grants'

/**
 * The editor's working shape for a set of grants, and its conversion to and from the stored ones.
 *
 * A stored grant carries **one** permission over **one** resource. A row carries one permission over
 * the *set* of resources chosen for it, because that is the decision an administrator actually makes
 * — "this role may read these three buckets" — and splitting it into three rows would ask them to
 * repeat the permission three times and keep the copies in step by hand.
 *
 * The scope is **determined by the permission** rather than chosen: `storage:bucket:read` is scoped
 * to a bucket and nothing else. The row therefore holds only what a person decides: which permission,
 * whether it applies everywhere or to named resources, which ones, and — for permissions that admit
 * it — which fields of each.
 *
 * Keeping this out of the components leaves the conversion testable without rendering anything.
 */
interface GrantRow {
  permission: Permission | ''
  /** Ignored for instance-scoped permissions, which have no resource to name. */
  anywhere: boolean
  /** The named resources, when not applying anywhere. */
  resources: string[]
  /**
   * Field selection per named resource, for permissions that admit one.
   *
   * Keyed by resource because each grant carries its own: a role may read every field of `articles`
   * and only `title` of `products`, and one selection shared across the row could not say that.
   * A resource absent from this map is unrestricted, which is what an absent `fields` means on the
   * grant itself.
   */
  fields: Record<string, FieldSelector>
}

/**
 * A fresh row starts **named, not anywhere**, and with nothing selected.
 *
 * The wildcard resource is the widest grant the editor can express, and defaulting to it made the
 * widest option the one reached by leaving a control alone. The row is consequently incomplete until
 * a resource is chosen, which is the intended prompt.
 */
const emptyRow = (): GrantRow => ({ permission: '', anywhere: false, resources: [], fields: {} })

/** Whether this row's permission admits a field selection at all. */
const rowSelectsFields = (row: GrantRow): boolean =>
  row.permission !== '' && isFieldSelectable(row.permission)

/** The selection for one resource. Absent means every field, which is the unrestricted case. */
const fieldsFor = (row: GrantRow, resource: string): FieldSelector =>
  row.fields[resource] ?? WILDCARD

/** An empty array selects nothing, which is not a grant anyone meant to write. */
const isFieldSelectionEmpty = (selection: FieldSelector): boolean =>
  selection !== WILDCARD && selection.length === 0

/**
 * Adds a named resource to a row.
 *
 * A field-selectable permission gets an **empty** selection rather than inheriting the unrestricted
 * default. Absence of a field list means every field — which is right for a grant already stored,
 * and wrong as the starting point for one being composed, because it would hand out every field of
 * a collection the moment it was switched on. The row is incomplete until the administrator either
 * names fields or chooses "every field" deliberately, matching how naming a resource works.
 */
function withResource (row: GrantRow, resource: string): GrantRow {
  const fields = rowSelectsFields(row) ? { ...row.fields, [resource]: [] } : row.fields
  return { ...row, resources: [...row.resources, resource], fields }
}

/**
 * Removes a named resource from a row, and the field selection that belonged to it.
 *
 * Leaving the selection behind would silently reapply it if the same resource were switched back
 * on later, which is not what switching it off said.
 */
function withoutResource (row: GrantRow, resource: string): GrantRow {
  const { [resource]: _removed, ...fields } = row.fields
  return { ...row, resources: row.resources.filter(existing => existing !== resource), fields }
}

/** Whether the row still needs something before it can become grants. */
function isIncomplete (row: GrantRow): boolean {
  if (row.permission === '') return true
  if (!isResourceScoped(row.permission)) return false
  if (row.anywhere) return false
  if (row.resources.length === 0) return true

  // A resource whose fields are all switched off grants nothing over it, and saving that as a grant
  // would record a decision the administrator did not make.
  if (!rowSelectsFields(row)) return false
  return row.resources.some(resource => isFieldSelectionEmpty(fieldsFor(row, resource)))
}

/** The grant for one named resource of a row. */
function namedGrant (row: GrantRow, permission: ResourceScopedPermission, resource: string): Grant {
  const grant: Grant = {
    permission,
    resource: { scope: getResourceScope(permission), id: resource.trim() }
  }

  // Only a restriction is recorded. Writing `fields: '*'` would say the same as omitting it while
  // making every unrestricted grant carry a key that has to be read to be understood.
  const selection = fieldsFor(row, resource)
  if (rowSelectsFields(row) && selection !== WILDCARD) grant.fields = [...selection]
  return grant
}

/**
 * The grants one row describes: none if it is incomplete, one per named resource otherwise.
 *
 * An instance-scoped permission, and any permission applying anywhere, is a single grant over the
 * wildcard resource.
 */
function rowToGrants (row: GrantRow): Grant[] {
  if (isIncomplete(row)) return []
  const permission = row.permission as Permission

  // Narrowed in two steps rather than one condition, so the resource-scoped branch below carries
  // the narrowed type instead of a cast.
  if (!isResourceScoped(permission)) return [{ permission, resource: WILDCARD }]
  if (row.anywhere) return [{ permission, resource: WILDCARD }]

  return row.resources.map(resource => namedGrant(row, permission, resource))
}

/**
 * The grants a set of rows describes.
 *
 * Incomplete rows are dropped rather than submitted as something half-formed — a permission chosen
 * but not yet given its resource is an edit in progress, not an instruction.
 */
const rowsToGrants = (rows: GrantRow[]): Grant[] => rows.flatMap(rowToGrants)

/**
 * The key grants are grouped under when a role is opened for editing.
 *
 * Grants sharing a permission collapse into one row, which is how they were composed. A grant over
 * the wildcard resource keeps its own row: it says something different from a list of named
 * resources — "and anything added later" — and merging the two would lose that.
 */
const rowKey = (grant: Grant): string =>
  `${grant.permission}:${grant.resource === WILDCARD ? WILDCARD : grant.resource.scope}:${grant.resource === WILDCARD ? 'any' : 'named'}`

/** Adds one stored grant to the row it belongs in, creating that row if it is the first. */
function absorb (rows: Map<string, GrantRow>, grant: Grant): void {
  const key = rowKey(grant)
  const row = rows.get(key) ?? {
    permission: grant.permission as Permission,
    anywhere: grant.resource === WILDCARD,
    resources: [],
    fields: {}
  }

  if (grant.resource !== WILDCARD) {
    row.resources = [...row.resources, grant.resource.id]
    if (grant.fields !== undefined) row.fields[grant.resource.id] = grant.fields
  }

  rows.set(key, row)
}

function grantsToRows (grants: Grant[]): GrantRow[] {
  if (grants.length === 0) return [emptyRow()]

  const rows = new Map<string, GrantRow>()
  for (const grant of grants) absorb(rows, grant)
  return [...rows.values()]
}

export {
  emptyRow,
  isIncomplete,
  rowSelectsFields,
  fieldsFor,
  withResource,
  withoutResource,
  rowToGrants,
  rowsToGrants,
  grantsToRows
}

export type {
  GrantRow
}
