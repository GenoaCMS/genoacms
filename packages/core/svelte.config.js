import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import { config as genoaConfig } from '@genoacms/cloudabstraction'

const BUILD_PROVIDER = process.env['BUILD_PROVIDER'] || 0
const { svelteKitAdapter } = await genoaConfig.deployment.providers[BUILD_PROVIDER].adapter
const adapter = (await import(svelteKitAdapter)).default

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Consult https://kit.svelte.dev/docs/integrations#preprocessors
  // for more information about preprocessors
  preprocess: vitePreprocess(),

  kit: {
    // adapter-auto only supports some environments, see https://kit.svelte.dev/docs/adapter-auto for a list.
    // If your environment is not supported or you settled on a specific environment, switch out the adapter.
    // See https://kit.svelte.dev/docs/adapters for more information about adapters.
    adapter: adapter()
  }
}

export default config
