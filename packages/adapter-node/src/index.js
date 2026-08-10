/**
 * @import {Adapter} from '@genoacms/cloudabstraction/deployment'
 */

/**
 * @type {Adapter['svelteKitAdapter']}
 */
const svelteKitAdapter = '@sveltejs/adapter-node'

/**
 * @type {Adapter['deployProcedure']}
 */
const deployProcedure = async () => {
  const deploy = (await import('./deploy.js')).default
  await deploy()
}

export {
  svelteKitAdapter,
  deployProcedure
}
