/**
 * The permission vocabulary of GenoaCMS.
 *
 * Permissions are application-defined semantics over application-defined resources, so this
 * table is the authoritative list — there is no external system that can enumerate or evaluate
 * it. Every permission a service function can demand appears here, and nothing else is a
 * permission.
 *
 * Permissions are declared as a typed union rather than free strings so that a service function
 * demanding a permission that does not exist, or a role manifest granting one, is a type error
 * rather than a silently unsatisfiable check.
 */

/**
 * What a permission is granted over.
 *
 * An `instance` permission is unqualified: holding it means holding it across the whole CMS.
 * A resource-scoped permission is meaningless without naming the bucket or collection it applies
 * to — `db:collection:read` is not a decision until a collection is named.
 */
type PermissionScope = 'instance' | 'bucket' | 'collection'

/**
 * The four functional domains. Domain membership is not derivable from the permission
 * string: `components:*` and `pages:*` both belong to the component and page service.
 */
type PermissionDomain = 'storage' | 'database' | 'content' | 'configuration'

interface PermissionDefinition {
  domain: PermissionDomain
  scope: PermissionScope
}

/**
 * Storage permissions are scoped at the bucket level rather than per file. Not every storage
 * adapter exposes file-level ACLs, and per-file grants would oblige the CMS to write its own
 * metadata into user buckets to track them.
 *
 * There is deliberately no permission for listing the bucket catalog. The catalog is filtered to
 * the buckets the caller holds some grant on, so a caller with no grants sees an empty list —
 * indistinguishable from being denied the catalog outright. A separate `list` permission would
 * decide nothing that the grants below do not already decide.
 *
 * There is likewise no permission for registering or configuring a bucket. Bucket declarations
 * are Tier-1 configuration and immutable at runtime, and administering the adapter that provides
 * them is `config:adapters:manage`. A storage-domain permission for it would be a second name
 * for one operation.
 */
const storagePermissions = {
  'storage:bucket:read': { domain: 'storage', scope: 'bucket' },
  'storage:bucket:write': { domain: 'storage', scope: 'bucket' },
  'storage:bucket:delete': { domain: 'storage', scope: 'bucket' }
} as const satisfies Record<string, PermissionDefinition>

/**
 * Database permissions are scoped per collection. Field-level masking refines these further and
 * is declared against the collection schema rather than as additional permissions, so it does
 * not appear in this table.
 */
const databasePermissions = {
  'db:collection:read': { domain: 'database', scope: 'collection' },
  'db:collection:write': { domain: 'database', scope: 'collection' },
  'db:collection:delete': { domain: 'database', scope: 'collection' },
  'db:collection:schema': { domain: 'database', scope: 'collection' }
} as const satisfies Record<string, PermissionDefinition>

/**
 * Component and page permissions follow the two lifecycles they govern: component development
 * and page publishing. They are instance-scoped — the architecture does not define per-component
 * or per-page grants, and inventing them here would put a scope in the vocabulary that no service
 * function could resolve.
 *
 * Reads are explicit here, as they are in the storage and database domains. Without
 * `pages:read` and `components:prebuilt:read` there was no permission a check could name, so every
 * principal the instance knew could open every draft — and a read-restricted role was not
 * expressible at all.
 *
 * `components:dynamic:commit` is the highest-value permission in the system: it runs static
 * analysis, compiles a bundle, signs it, and publishes an executable that consumers will run.
 * Because containment of a determined author is not claimed, restricting this permission to a
 * small trusted set is itself a compensating control.
 */
const contentPermissions = {
  'components:prebuilt:read': { domain: 'content', scope: 'instance' },
  'components:prebuilt:register': { domain: 'content', scope: 'instance' },
  'components:prebuilt:modify': { domain: 'content', scope: 'instance' },
  'components:dynamic:view_code': { domain: 'content', scope: 'instance' },
  'components:dynamic:edit': { domain: 'content', scope: 'instance' },
  'components:dynamic:commit': { domain: 'content', scope: 'instance' },
  'pages:read': { domain: 'content', scope: 'instance' },
  'pages:content_edit': { domain: 'content', scope: 'instance' },
  'pages:structure_edit': { domain: 'content', scope: 'instance' },
  'pages:publish': { domain: 'content', scope: 'instance' },
  'pages:delete': { domain: 'content', scope: 'instance' }
} as const satisfies Record<string, PermissionDefinition>

/**
 * Configuration permissions govern the CMS itself. They are instance-scoped by nature — there is
 * one user registry, one key hierarchy, and one adapter configuration per instance.
 */
const configurationPermissions = {
  'config:users:manage': { domain: 'configuration', scope: 'instance' },
  'config:roles:manage': { domain: 'configuration', scope: 'instance' },
  'config:keys:manage': { domain: 'configuration', scope: 'instance' },
  'config:security:manage': { domain: 'configuration', scope: 'instance' },
  'config:adapters:manage': { domain: 'configuration', scope: 'instance' }
} as const satisfies Record<string, PermissionDefinition>

const permissionDefinitions = {
  ...storagePermissions,
  ...databasePermissions,
  ...contentPermissions,
  ...configurationPermissions
}

type Permission = keyof typeof permissionDefinitions

/**
 * The permissions declared with a given scope.
 *
 * Derived from the table rather than listed again, so a permission whose scope changes moves
 * between these types automatically and every call site demanding it is re-checked.
 */
type PermissionWithScope<S extends PermissionScope> = {
  [K in Permission]: (typeof permissionDefinitions)[K]['scope'] extends S ? K : never
}[Permission]

/** Permissions decidable without naming a resource. */
type InstancePermission = PermissionWithScope<'instance'>

/** Permissions that are not a decision until a bucket or collection is named. */
type ResourceScopedPermission = Exclude<Permission, InstancePermission>

const permissions = Object.keys(permissionDefinitions) as Permission[]

/**
 * Narrows an arbitrary string to a `Permission`.
 *
 * Permission strings arrive from stored role manifests, which are outside the type system, so
 * this is the boundary at which they become trusted. Own-property lookup is deliberate:
 * `'constructor' in permissionDefinitions` is true, and a manifest granting `"constructor"` must
 * not be mistaken for a permission.
 */
function isPermission (value: string): value is Permission {
  return Object.hasOwn(permissionDefinitions, value)
}

function getPermissionDefinition (permission: Permission): PermissionDefinition {
  return permissionDefinitions[permission]
}

function getPermissionScope (permission: Permission): PermissionScope {
  return getPermissionDefinition(permission).scope
}

function getPermissionDomain (permission: Permission): PermissionDomain {
  return getPermissionDefinition(permission).domain
}

/**
 * Whether a permission requires a resource to be named before it can be decided.
 *
 * A type predicate rather than a plain boolean, so that code iterating over the whole permission
 * space — the permission matrix above all — narrows to the right overload instead of reaching for
 * a cast.
 */
function isResourceScoped (permission: Permission): permission is ResourceScopedPermission {
  return getPermissionScope(permission) !== 'instance'
}

function getPermissionsByDomain (domain: PermissionDomain): Permission[] {
  return permissions.filter(permission => getPermissionDomain(permission) === domain)
}

export {
  permissions,
  permissionDefinitions,
  isPermission,
  getPermissionDefinition,
  getPermissionScope,
  getPermissionDomain,
  isResourceScoped,
  getPermissionsByDomain
}

export type {
  Permission,
  PermissionScope,
  PermissionDomain,
  PermissionDefinition,
  InstancePermission,
  ResourceScopedPermission
}
