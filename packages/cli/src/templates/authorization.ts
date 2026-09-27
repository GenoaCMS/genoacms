import type { AuthorizationConfig } from '@genoacms/config'

export const authorization: AuthorizationConfig = {
  // Authority, not seeding: what is declared here is immutable at runtime, and removed from the
  // instance when removed from here. At least one assignment is needed to administer a new site.
  roles: {
    Administrator: [{ permission: '*', resource: '*' }]
  },
  assignments: {
    // TODO: the subject of your first administrator, as issued by the authentication
    // adapter — never an email address. This bootstraps the permission system.
    // '<subject-from-your-authentication-provider>': ['Administrator']
  }
}
