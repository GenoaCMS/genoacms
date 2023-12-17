import type * as authAdapter from './services/auth'
import type * as databaseAdapter from './services/database'
import type * as storageAdapter from './services/storage'

interface Config {
  auth: {
    adapter: authAdapter
  }
  database: {
    adapter: databaseAdapter
    // TODO: type schemas
  }
  storage: {
    adapter: storageAdapter
  }
}

export default Config
