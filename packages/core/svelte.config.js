import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import { readGenoaEnvironment, resolveKitAdapter } from '@genoacms/config/load'

// svelte.config.js cannot know Vite's command; GENOA_MODE is set by the CLI and by `pnpm build`.
const { root, file, target, mode } = readGenoaEnvironment('development')

/** @type {import('@sveltejs/kit').Config} */
const config = {
  // Consult https://kit.svelte.dev/docs/integrations#preprocessors
  // for more information about preprocessors
  preprocess: vitePreprocess(),

  kit: {
    // The deployment target's descriptor chooses the SvelteKit adapter; the dev server needs none.
    adapter: await resolveKitAdapter({ root, file, target, mode }),
    experimental: {
      remoteFunctions: true
    }
  }
}

export default config
