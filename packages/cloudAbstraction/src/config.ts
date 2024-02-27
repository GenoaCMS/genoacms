import path from 'node:path'
import type Config from './genoa.config.d.ts'

const workDir = process.cwd()
const configPath = path.join(workDir, 'genoa.config.js')

const config = (await import(configPath)).default as Config

export default config
