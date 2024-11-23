import type { Adapter } from '@genoacms/cloudabstraction/deployment'

const svelteKitAdapter: Adapter.svelteKitAdapter = '@genoacms/sveltekit-adapter-cloud-run-functions'

const deployProcedure: Adapter.deployProcedure = async () => {
  const deploy = (await import('./deploy.js')).default
  await deploy()
}

export {
  svelteKitAdapter,
  deployProcedure
}
