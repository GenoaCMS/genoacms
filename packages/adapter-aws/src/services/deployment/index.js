/**
 * @typedef {import('@genoacms/cloudabstraction/deployment').Adapter} Adapter
 */

/**
 * @type {Adapter.svelteKitAdapter}
 */
const svelteKitAdapter = '@sveltejs/adapter-node'

/**
 * @type {Adapter.deployProcedure}
 */
async function deployProcedure () {
  const { deploy } = await import('./deploy.js')
  await deploy()
}

export {
  svelteKitAdapter,
  deployProcedure
}
