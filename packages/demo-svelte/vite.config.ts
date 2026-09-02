import { sveltekit } from '@sveltejs/kit/vite'
import { defineConfig } from 'vite'

/**
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
  plugins: [sveltekit()],
  server: { port: 5181 }
})
