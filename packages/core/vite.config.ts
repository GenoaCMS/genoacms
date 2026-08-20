import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  /**
   * `.env` is a datastore here, not configuration.
   *
   * The development secrets adapter (`@genoacms/adapter-secrets-env`) keeps its secrets in `.env`
   * and **writes** to it at runtime — minting a key seed, advancing the registry sequence. Vite
   * watches the env files and restarts the dev server when one changes, so every such write killed
   * the request that made it: rotating a signing key reported failure while the server appeared to
   * crash, and revoking one published the revocation and *then* died, leaving the interface saying
   * it had failed when it had not.
   *
   * Turning env loading off is the accurate statement rather than a workaround: this project has no
   * `VITE_`-prefixed variables and imports nothing from `$env`, so `.env` holds only secrets the
   * adapter loads into `process.env` itself. Vite has no business in the file.
   *
   * If a Vite-visible variable is ever needed, it belongs in a separate env file with `envDir`
   * pointing at a directory the secret store does not write to — not back in this one.
   */
  envDir: false,
  test: {
    include: ['src/**/*.{test,spec}.{js,ts}', 'evidence/**/*.{test,spec}.{js,ts}']
  },
  ssr: {
    noExternal: []
  },
  server: {
    fs: {
      allow: ['../..']
    }
  },
  optimizeDeps: {
    include: []
  }
})
