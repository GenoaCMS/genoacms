import type * as authentication from './services/authentication/index'
import type * as database from './services/database/index'
import type * as storage from './services/storage'
import type { Config } from './genoa.config'

export {
  config,
  getProvider
} from './config'
export type {
  authentication,
  database,
  storage,
  Config
}
