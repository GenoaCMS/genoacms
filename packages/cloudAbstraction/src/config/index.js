import { configPath } from './paths.js'

/**
 * @type {import('./genoa.config.d.ts').Config}
 */
const config = (await import(configPath)).default

export default config
export { storageResource, reference } from './schemas.js'
