/**
 * The permission vocabulary of GenoaCMS.
 *
 * Permissions are application-defined semantics over application-defined resources, so this table is
 * the authoritative list — there is no external system that can enumerate or evaluate it. Every
 * permission a service function can demand appears here, and nothing else is a permission.
 *
 * ## Why the vocabulary lives here and enforcement does not
 *
 * Authorization is **not a cloud service**: there is no adapter, no provider, and nothing about it is
 * delegated. Deciding permissions stays in the CMS core, together with `requirePermission`,
 * resolution and the manifests.
 *
 * What lives here is the *vocabulary*, because it is part of the **configuration contract**.
 * `genoa.config` declares roles as grants carrying permission strings, so the definition of a valid
 * permission belongs beside the `Config` type that declares them — which also makes a mistyped
 * permission a type error in `genoa.config` rather than a grant that silently never matches.
 *
 * It is reachable outside the core for the same reason: the core is an application and exports
 * nothing, so a tool that helps compose configuration could not otherwise validate what it writes
 * without keeping a second copy of this list to drift out of step.
 *
 * @typedef {import('./permissions.d.ts').Permission} Permission
 * @typedef {import('./permissions.d.ts').PermissionDomain} PermissionDomain
 * @typedef {import('./permissions.d.ts').PermissionScope} PermissionScope
 * @typedef {import('./permissions.d.ts').PermissionDefinition} PermissionDefinition
 */

/**
 * Storage permissions are scoped at the bucket level rather than per file. Not every storage adapter
 * exposes file-level ACLs, and per-file grants would oblige the CMS to write its own metadata into
 * user buckets to track them.
 *
 * There is deliberately no permission for listing the bucket catalog: it is filtered to the buckets
 * the caller holds some grant on, so a `list` permission would decide nothing the grants below do
 * not already decide. Registering a bucket is likewise absent — bucket declarations are Tier-1
 * configuration, and administering the adapter behind them is `config:adapters:manage`.
 */
const storagePermissions = {
  'storage:bucket:read': { domain: 'storage', scope: 'bucket' },
  'storage:bucket:write': { domain: 'storage', scope: 'bucket' },
  'storage:bucket:delete': { domain: 'storage', scope: 'bucket' }
}

/**
 * Database permissions are scoped per collection. Field-level restriction refines `read` and `write`
 * further and is carried **on the grant** as a list of field names, not as additional permissions,
 * so it does not appear in this table.
 *
 * There is deliberately no `db:collection:schema`: it governed modifying a collection's shape, no
 * service function performs that, and granted across every collection it described no capability an
 * operator would deliberately hand out.
 */
const databasePermissions = {
  'db:collection:read': { domain: 'database', scope: 'collection' },
  'db:collection:write': { domain: 'database', scope: 'collection' },
  'db:collection:delete': { domain: 'database', scope: 'collection' }
}

/**
 * Component and page permissions follow the two lifecycles they govern: component development and
 * page publishing. They are instance-scoped — the architecture does not define per-component or
 * per-page grants.
 *
 * The four component permissions govern one component vocabulary, not two. A component's kind —
 * whether its code lives in the consuming application or is written here — decides what the CMS
 * stores for it, and nothing about who may act on it: the registrar describes both the same way, so
 * a permission naming a kind would draw a line the interface does not have.
 *
 * `components:code` is the highest-value permission in the system: it is what reaches a component's
 * source at all, and publishing runs static analysis, compiles a bundle, signs it, and produces an
 * executable that consumers will run. Restricting it to a small trusted set is itself a
 * compensating control.
 *
 * `components:register` governs a component's **existence** — creating and deleting it — as distinct
 * from describing its shape (`modify`) or writing its code (`code`). Deleting removes the source and
 * every publication outright, which no amount of either should imply.
 */
const contentPermissions = {
  'components:read': { domain: 'content', scope: 'instance' },
  'components:register': { domain: 'content', scope: 'instance' },
  'components:modify': { domain: 'content', scope: 'instance' },
  'components:code': { domain: 'content', scope: 'instance' },
  'pages:read': { domain: 'content', scope: 'instance' },
  'pages:content_edit': { domain: 'content', scope: 'instance' },
  'pages:structure_edit': { domain: 'content', scope: 'instance' },
  'pages:publish': { domain: 'content', scope: 'instance' },
  'pages:delete': { domain: 'content', scope: 'instance' }
}

/**
 * Configuration permissions govern the CMS itself. Instance-scoped by nature — there is one user
 * registry, one key hierarchy and one adapter configuration per instance.
 */
const configurationPermissions = {
  'config:users:manage': { domain: 'configuration', scope: 'instance' },
  'config:roles:manage': { domain: 'configuration', scope: 'instance' },
  'config:keys:manage': { domain: 'configuration', scope: 'instance' },
  'config:security:manage': { domain: 'configuration', scope: 'instance' },
  'config:adapters:manage': { domain: 'configuration', scope: 'instance' }
}

/** @type {Record<Permission, PermissionDefinition>} */
const permissionDefinitions = {
  ...storagePermissions,
  ...databasePermissions,
  ...contentPermissions,
  ...configurationPermissions
}

/** @type {Permission[]} */
const permissions = /** @type {Permission[]} */ (Object.keys(permissionDefinitions))

/**
 * Narrows an arbitrary string to a permission.
 *
 * Permission strings arrive from stored role manifests and from hand-written configuration, both
 * outside the type system, so this is the boundary at which they become trusted. Own-property lookup
 * is deliberate: `'constructor' in permissionDefinitions` is true, and a manifest granting
 * `"constructor"` must not be mistaken for a permission.
 *
 * @param {string} value
 * @returns {value is Permission}
 */
function isPermission (value) {
  return Object.hasOwn(permissionDefinitions, value)
}

/**
 * @param {Permission} permission
 * @returns {PermissionDefinition}
 */
function getPermissionDefinition (permission) {
  return permissionDefinitions[permission]
}

/**
 * @param {Permission} permission
 * @returns {PermissionScope}
 */
function getPermissionScope (permission) {
  return getPermissionDefinition(permission).scope
}

/**
 * @param {Permission} permission
 * @returns {PermissionDomain}
 */
function getPermissionDomain (permission) {
  return getPermissionDefinition(permission).domain
}

/**
 * Whether a permission requires a resource to be named before it can be decided.
 *
 * @param {Permission} permission
 * @returns {boolean}
 */
function isResourceScoped (permission) {
  return getPermissionScope(permission) !== 'instance'
}

/**
 * The scope of a resource-scoped permission, narrowed to the kinds a resource can actually be.
 *
 * The guard is unreachable when the caller has already established the permission is resource
 * scoped, and is a runtime backstop rather than a cast that would keep compiling if the taxonomy
 * ever disagreed.
 *
 * @param {Permission} permission
 * @returns {'bucket' | 'collection'}
 */
function getResourceScope (permission) {
  const scope = getPermissionScope(permission)
  if (scope === 'instance') {
    throw new Error(`permission-scope-mismatch: '${permission}' is typed as resource-scoped but declared instance-scoped`)
  }
  return scope
}

/**
 * @param {PermissionDomain} domain
 * @returns {Permission[]}
 */
function getPermissionsByDomain (domain) {
  return permissions.filter(permission => getPermissionDomain(permission) === domain)
}

export {
  permissions,
  permissionDefinitions,
  isPermission,
  getPermissionDefinition,
  getPermissionScope,
  getResourceScope,
  getPermissionDomain,
  isResourceScoped,
  getPermissionsByDomain
}
