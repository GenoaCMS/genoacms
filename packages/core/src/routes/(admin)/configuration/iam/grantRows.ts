import { isResourceScoped, getPermissionScope, type Permission } from '$lib/script/authorization/permissions'
import { WILDCARD, type Grant } from '$lib/script/authorization/grants'

/**
 * The editor's working shape for a grant, and its conversion to and from the stored one.
 *
 * A stored grant carries a resource that is either the wildcard or a `{ scope, id }` pair, and the
 * scope is **determined by the permission** rather than chosen — `storage:bucket:read` is scoped to
 * a bucket and nothing else. The row therefore holds only what a person actually decides: which
 * permission, and whether it applies anywhere or to one named thing.
 *
 * Keeping this out of the component leaves the conversion testable without rendering anything.
 */
interface GrantRow {
  permission: Permission | ''
  /** Ignored for instance-scoped permissions, which have no resource to name. */
  anywhere: boolean
  resourceId: string
}

const emptyRow = (): GrantRow => ({ permission: '', anywhere: true, resourceId: '' })

/** Whether the row still needs a resource before it can become a grant. */
function isIncomplete (row: GrantRow): boolean {
  if (row.permission === '') return true
  if (!isResourceScoped(row.permission)) return false
  return !row.anywhere && row.resourceId.trim().length === 0
}

function rowToGrant (row: GrantRow): Grant | undefined {
  if (isIncomplete(row)) return undefined
  const permission = row.permission as Permission

  if (!isResourceScoped(permission) || row.anywhere) {
    return { permission, resource: WILDCARD }
  }
  return {
    permission,
    resource: { scope: getPermissionScope(permission), id: row.resourceId.trim() }
  } as Grant
}

function grantToRow (grant: Grant): GrantRow {
  if (grant.resource === WILDCARD) {
    return { permission: grant.permission as Permission, anywhere: true, resourceId: '' }
  }
  return {
    permission: grant.permission as Permission,
    anywhere: false,
    resourceId: grant.resource.id
  }
}

/**
 * The grants a set of rows describes.
 *
 * Incomplete rows are dropped rather than submitted as something half-formed — a permission chosen
 * but not yet given its resource is an edit in progress, not an instruction.
 */
const rowsToGrants = (rows: GrantRow[]): Grant[] =>
  rows.map(rowToGrant).filter((grant): grant is Grant => grant !== undefined)

const grantsToRows = (grants: Grant[]): GrantRow[] =>
  grants.length === 0 ? [emptyRow()] : grants.map(grantToRow)

export {
  emptyRow,
  isIncomplete,
  rowToGrant,
  rowsToGrants,
  grantsToRows
}

export type {
  GrantRow
}
