import adapter from '@genoacms/sveltekit-adapter-cloud-run-functions'
import { sveltekit } from '@sveltejs/kit/vite'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import { defineConfig } from 'vite'

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
 * No artifact proxy plugin here, unlike the other three demos.
 *
 * SvelteKit has real server routes, so the published documents are served by
 * `src/routes/artifacts/[...path]/+server.ts` instead of by dev-server middleware. The difference
 * that matters: a route survives `vite build`, and middleware does not — so this demo can be built
 * and previewed the way it would actually be deployed.
 *
 * Both go through the same `serveArtifact` and the same allowlist.
 */
export default defineConfig({
  plugins: [await sveltekit({ preprocess: vitePreprocess(), adapter: adapter() })],
  server: { port: 5181 }
})
