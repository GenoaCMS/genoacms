import path from 'node:path'

interface AdapterConfig<AuthT, DatabaseT, StorageT> {
  auth: AuthT
  database: DatabaseT
  storage: StorageT
}

type generalConfig = object // TODO: import from package managing config

type Config<AuthT extends object, DatabaseT extends object, StorageT extends object> = Record<string, AdapterConfig<AuthT, DatabaseT, StorageT> | generalConfig>

const workDir = process.cwd()
const configPath = path.join(workDir, 'genoa.config.js')

const config = (await import(configPath)).default as Config<object, object, object>

export default config
