// TODO: import credentials

/**
 * @type {import('@genoacms/cloudabstraction').genoaConfig}
 */
const config = {
  authentication: {
    adapterPath: '%authentication-adapter%'
    // TODO: configure authentication
  },
  authorization: {
    adapterPath: '%authorization-adapter%'
    // TODO: configure authorization
  },
  database: {
    adapterPath: '%database-adapter%'
    // TODO: configure database
  },
  storage: {
    adapterPath: '%storage-adapter%'
    // TODO: configure storage
  },
  // TODO: configure collections
}

export default config
