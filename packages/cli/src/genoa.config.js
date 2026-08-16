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
