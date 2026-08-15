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
    adminSubject: ''
  },
  // TODO: configure collections
}

export default config
