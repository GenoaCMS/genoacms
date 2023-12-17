import type * as auth from './services/auth/index.d.ts'
import type * as database from './services/database/index.d.ts'
import type * as storage from './services/storage/index.d.ts'
import type genoaConfig from './genoa.config.d.ts'
import config from './config.js'

export type {
  auth,
  database,
  storage,
  genoaConfig
}
export {
  config
}
