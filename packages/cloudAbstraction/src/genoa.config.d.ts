import type * as authAdapter from './services/auth'
import type * as databaseAdapter from './services/database'
import type * as storageAdapter from './services/storage'

interface Config {
  auth: {
    adapter: authAdapter
    [key: string]: any
  }
  database: {
    adapter: databaseAdapter
    [key: string]: any
  }
  storage: {
    adapter: storageAdapter
    [key: string]: any
  }
  [key: string]: any
}

export default Config
