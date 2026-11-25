import type { AuthorizationConfig } from '@genoacms/config'
import type { Permission } from '@genoacms/internal/authorization'

const SITE_BUILDER_PERMISSIONS: Permission[] = [
  'components:read', 'components:register', 'components:modify', 'components:code',
  'pages:read', 'pages:content_edit', 'pages:structure_edit', 'pages:publish', 'pages:delete'
]

// Authority: immutable at runtime, merged when authorization is read rather than written into
// the manifests, and deleting one revokes what it granted.
export const authorization: AuthorizationConfig = {
  roles: {
    Administrator: [{ permission: '*', resource: '*' }],
    'Site builder': SITE_BUILDER_PERMISSIONS.map(permission => ({ permission, resource: '*' }))
  },
  assignments: {
    cc0Xb1senAPCfF7oKfErZjXSeT03: ['Administrator'],
    'agent:claude': ['Site builder']
  }
}
