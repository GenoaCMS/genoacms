import { configPath } from './paths.js'

/**
 * @type {import('./genoa.config.d.ts').Config}
 */
const config = (await import(configPath)).default

/**
 * @param {string} type
 * @param {string} adapterPath
 * @returns {import('./genoa.config.d.ts').Provider}
 */
function getProvider (type, adapterPath) {
  /**
   * @type{undefined | import('./genoa.config.d.ts').Provider}
  */
  const provider = config[type].providers
    .find((provider) => provider.adapterPath === adapterPath && isInitialized.adapterPath !== true)
  if (!provider) {
    throw new Error(`Unable to get the provider for ${type} with path ${adapterPath}`)
  }
  provider.isInitialized = true
  return provider
}

/**
 * @param {string} name
 * @returns {import('../services/deployment/index.d.ts').DeploymentProvider}
 */
function getDeploymentProvider (name) {
  const provider = config.deployment.providers.find(provider => provider.name === name)
  if (!provider) {
    throw new Error(`Unable to get deployment provider with name ${name}`)
  }
  return provider
}

export { config, getProvider, getDeploymentProvider }
export { storageResource, reference } from './schemas.js'
