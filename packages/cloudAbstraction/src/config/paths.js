import { join } from 'path'

const workDir = process.cwd()
const configDirectory = join(workDir, 'genoa.config')
const configPath = join(configDirectory, 'index.js')
const configBundlePath = join(workDir, 'build', 'genoa.config', 'index.js')

export {
  configPath,
  configBundlePath
}
