import { join } from 'path'

const workDir = process.cwd()
const configDirectory = join(workDir, 'genoa.config')
const configPath = join(configDirectory, 'index.js')

/**
 * @type {import('./genoa.config.d.ts').Config}
 */
const config = (await import(configPath)).default

/**
  * @param {object | undefined} adapterPath
  * @returns {void}
  */
function normalizeAdapterPath (config) {
  if (config?.adapterPath === undefined) return
  config.adapterPath = join(configDirectory, config.adapterPath)
}

normalizeAdapterPath(config.authentication)
normalizeAdapterPath(config.authorization)
normalizeAdapterPath(config.database)
normalizeAdapterPath(config.deployment)
normalizeAdapterPath(config.storage)

export default config
