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
  security: {
    // TODO: set to the subject of the seed administrator, as issued by the
    // authentication adapter. This identity bootstraps the permission system.
    adminSubject: '',
    // Seeds the signed security policy document at first start.
    subordinateKeyRotationDays: 90
  },
  // TODO: configure collections
}

export default config
