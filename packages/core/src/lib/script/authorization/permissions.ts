/**
 * The permission vocabulary, re-exported from `@genoacms/cloudabstraction`.
 *
 * The table itself lives there rather than here, and the reason is not that authorization is a cloud
 * service — it is not, and §4.2.1a still holds: there is no adapter, no provider, and nothing about
 * deciding permissions is delegated. Enforcement stays in this module, beside `requirePermission`,
 * resolution and the manifests.
 *
 * What moved is the **vocabulary**, because it is part of the configuration contract. `genoa.config`
 * declares roles as grants carrying permission strings, so the definition of a valid permission
 * belongs beside the `Config` type that declares them — which is also what lets `authorization.roles` be
 * typed, making a mistyped permission a type error in configuration rather than a grant that
 * silently never matches.
 *
 * It had to be reachable from outside the core for a practical reason too: the core is a SvelteKit
 * application and exports nothing, so the CLI that helps compose role declarations could not
 * validate what it writes without keeping a second copy of the list to drift out of step.
 *
 * This file stays as the import site the rest of the core uses, so moving the table cost no churn
 * across the service layer — and if the vocabulary ever needs to move again, it moves here alone.
 */

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
} from '@genoacms/cloudabstraction/authorization'

export type {
  Permission,
  PermissionScope,
  PermissionDomain,
  PermissionDefinition,
  InstancePermission,
  ResourceScopedPermission
} from '@genoacms/cloudabstraction/authorization'
