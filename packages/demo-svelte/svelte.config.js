import adapter from '@genoacms/sveltekit-adapter-cloud-run-functions'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'

/**
 * Built for a Cloud Run Function, with the CMS's own adapter.
 *
 * **Not `svelte-adapter-firebase`** — the author's assessment is that it is broken, and this adapter
 * exists because of it. It emits `build/index.js` exporting `handler`, plus `build/client` and
 * `build/prerendered` for Hosting to serve.
 *
 * **Not `adapter-static` either**, which was the obvious choice for a demo and is the wrong one: this
 * application has a real server route at `routes/artifacts/[...path]`, and `adapter-static` requires
 * every route to be prerenderable. Deploying as a function is what lets that route exist in
 * production, which is the whole reason it is a SvelteKit application rather than a fourth SPA.
 *
 * @type {import('@sveltejs/kit').Config}
 */
export default {
  preprocess: vitePreprocess(),
  kit: { adapter: adapter() }
}
