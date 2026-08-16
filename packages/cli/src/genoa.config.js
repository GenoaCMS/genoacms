// TODO: import credentials

/**
 * @type {import('@genoacms/cloudabstraction').genoaConfig}
 */
const config = {
  authentication: {
    adapter: import('%authentication-adapter%')
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
    // Manifest signing does not exist yet, so authorization data is acted upon
    // unverified. Change to 'require-signature' once it does.
    manifestTrust: 'accept-unsigned'
  },
  // TODO: configure collections
}

export default config
