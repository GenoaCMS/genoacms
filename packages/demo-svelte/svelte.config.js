import adapter from '@sveltejs/adapter-node'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/**
 * A plain Node build.
 *
 * The CMS resolves its adapter from `genoa.config`, because it deploys where the instance is
 * configured to. This is a **consumer** application and has no `genoa.config` — it knows an origin to
 * fetch from and a public key, which is the entire point.
 *
 * @type {import('@sveltejs/kit').Config}
 */
export default {
  preprocess: vitePreprocess(),
  kit: { adapter: adapter() }
}
