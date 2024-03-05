// TODO: import credentials

/**
 * @type {import('@genoacms/cloudabstraction').genoaConfig}
 */
const config = {
  authentication: {
    adapter: import('%authentication-adapter%')
    // TODO: configure authentication
  },
  authorization: {
    adapter: import('%authorization-adapter%')
    // TODO: configure authorization
  },
  database: {
    adapter: import('%database-adapter%')
    // TODO: configure database
  },
  storage: {
    adapter: import('%storage-adapter%')
    // TODO: configure storage
  },
  // TODO: configure collections
}

export default config
