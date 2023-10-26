import path from 'node:path'

const workDir = process.cwd()
const configPath = path.join(workDir, 'genoa.config.js')

const config = await import(configPath)

export default config.default
