import type { AuthorizationConfig } from '@genoacms/config'

// Authority: immutable at runtime, merged when authorization is read rather than written into
// the manifests, and deleting one revokes what it granted.
export const authorization: AuthorizationConfig = {
  roles: {
    Administrator: [{ permission: '*', resource: '*' }]
  },
  assignments: {
    cc0Xb1senAPCfF7oKfErZjXSeT03: ['Administrator']
  }
}
