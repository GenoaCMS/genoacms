/**
 * Types for the permission vocabulary.
 *
 * **The union below and the table in `permissions.js` are two statements of one list**, which is the
 * cost of this package being plain JavaScript with hand-written declarations. They are kept honest
 * from both ends: `permissions.test.js` here asserts the runtime table against a spelled-out list,
 * and the core's `permissions.test.ts` does the same against the values it imports — so a permission
 * added to one and not the other fails a test rather than drifting quietly.
 */

/**
 * What a permission is granted over.
 *
 * An `instance` permission is unqualified: holding it means holding it across the whole CMS. A
 * resource-scoped permission is meaningless without naming the bucket or collection it applies to —
 * `db:collection:read` is not a decision until a collection is named.
 */
export type PermissionScope = 'instance' | 'bucket' | 'collection'

/**
 * The four functional domains. Domain membership is not derivable from the permission string:
 * `components:*` and `pages:*` both belong to the component and page service.
 */
export type PermissionDomain = 'storage' | 'database' | 'content' | 'configuration'

export interface PermissionDefinition {
  domain: PermissionDomain
  scope: PermissionScope
}

/**
 * Every permission GenoaCMS defines.
 *
 * Declared as a union rather than as `string` so that a service function demanding a permission that
 * does not exist, a role manifest granting one, or a `genoa.config` declaring one, is a type error
 * rather than a silently unsatisfiable check.
 */
export type Permission =
  | 'storage:bucket:read'
  | 'storage:bucket:write'
  | 'storage:bucket:delete'
  | 'db:collection:read'
  | 'db:collection:write'
  | 'db:collection:delete'
  | 'components:read'
  | 'components:register'
  | 'components:modify'
  | 'components:code'
  | 'pages:read'
  | 'pages:content_edit'
  | 'pages:structure_edit'
  | 'pages:publish'
  | 'pages:delete'
  | 'config:users:manage'
  | 'config:roles:manage'
  | 'config:keys:manage'
  | 'config:security:manage'
  | 'config:adapters:manage'

/** Permissions decidable without naming a resource. */
export type InstancePermission = Exclude<
Permission,
'storage:bucket:read' | 'storage:bucket:write' | 'storage:bucket:delete' |
'db:collection:read' | 'db:collection:write' | 'db:collection:delete'
>

/** Permissions that are not a decision until a bucket or collection is named. */
export type ResourceScopedPermission = Exclude<Permission, InstancePermission>

/** The kinds of thing a grant can name. Instance-scoped permissions name nothing. */
export type ResourceScope = Exclude<PermissionScope, 'instance'>

export declare const permissions: Permission[]
export declare const permissionDefinitions: Record<Permission, PermissionDefinition>

export declare function isPermission (value: string): value is Permission
export declare function getPermissionDefinition (permission: Permission): PermissionDefinition
export declare function getPermissionScope (permission: Permission): PermissionScope
export declare function getPermissionDomain (permission: Permission): PermissionDomain
export declare function isResourceScoped (permission: Permission): permission is ResourceScopedPermission
export declare function getResourceScope (permission: ResourceScopedPermission): ResourceScope
export declare function getPermissionsByDomain (domain: PermissionDomain): Permission[]
