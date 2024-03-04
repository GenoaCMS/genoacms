import path from 'node:path'

const workDir = process.cwd()
const configPath = path.join(workDir, 'genoa.config.js')

/**
 * @type {import('./genoa.config.d.ts').Config}
 */
const config = (await import(configPath)).default

export default config
