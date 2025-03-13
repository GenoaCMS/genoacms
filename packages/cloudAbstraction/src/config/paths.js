import { join } from 'path'

const workDir = process.cwd()
const configWhileBuild = process.env.GENOA_BUILD === 'true' ? '' : join('..', '..', '..')
const configDirectory = join(workDir, configWhileBuild, process.env.GENOA_CONFIG_PATH ?? 'genoa.config')
const configPath = join(configDirectory, 'index.js')
const configBundlePath = join(workDir, '.genoacms', 'genoa.config')

export {
  configPath,
  configBundlePath
}
