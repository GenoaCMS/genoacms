// TODO: import credentials

/**
 * @type {import('@genoacms/cloudabstraction').genoaConfig}
 */
const config = {
  authentication: {
    adapter: import('%authentication-adapter%'),
    cookieName: '__session',
    // TODO: configure authentication
  },
  database: {
    adapter: import('%database-adapter%')
    // TODO: configure database
  },
  storage: {
    adapter: import('%storage-adapter%')
    // TODO: configure storage
  },
  secrets: {
    // Development only: keeps secrets in plaintext in .env. Replace with a
    // real secret manager adapter before deploying.
    providers: [
      {
        name: 'local',
        adapterPath: '@genoacms/adapter-secrets-env',
        adapter: import('@genoacms/adapter-secrets-env')
      }
    ]
  },
  authorization: {
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
  },
  security: {
    // Seeds the signed security policy document at first start.
    subordinateKeyRotationDays: 90,
    // Runtime guard ceilings for dynamic components. Sized so that no reasonable presentational
    // component reaches one: a guard firing on correct code teaches operators to raise it.
    maxFuel: 1_000_000,
    maxDepth: 100,
    maxAllocation: 10_000_000
  },
  // TODO: configure collections
}

export default config
