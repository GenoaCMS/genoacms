import type { AuthorizationConfig } from '@genoacms/config'

// Authority: immutable at runtime, merged when authorization is read rather than written into
// the manifests, and deleting one revokes what it granted.
export const authorization: AuthorizationConfig = {
  roles: {
    Administrator: [{ permission: '*', resource: '*' }]
  },
  assignments: {
    'e0d5a1c4-5a0f-4a4e-9b3a-6d1c8f2b7a01': ['Administrator']
  }
}
