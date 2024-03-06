import type { Adapter } from '@genoacms/cloudabstraction/deployment'

const svelteKitAdapter: Adapter.svelteKitAdapter = '@sveltejs/adapter-node'

const deployProcedure: Adapter.deployProcedure = async () => {
  const deploy = (await import('./deploy.js')).default
  await deploy()
}

export {
  svelteKitAdapter,
  deployProcedure
}
