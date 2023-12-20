import type * as AuthAdapter from './services/auth'
import type * as DatabaseAdapter from './services/database'
import type * as StorageAdapter from './services/storage'

interface Config {
  auth: {
    adapter: Promise<AuthAdapter>
    [key: string]: any
  }
  database: {
    adapter: Promise<DatabaseAdapter>
    [key: string]: any
  }
  storage: {
    adapter: Promise<StorageAdapter>
    [key: string]: any
  }
  [key: string]: any
}

export default Config
