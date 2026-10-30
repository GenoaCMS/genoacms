import { sveltekit } from '@sveltejs/kit/vite'
import type { Adapter } from '@sveltejs/kit'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import tailwindcss from '@tailwindcss/vite'
import { genoa } from '@genoacms/config/vite'
import { readGenoaEnvironment, resolveKitTarget } from '@genoacms/config/load'
import { defineConfig } from 'vite'

const { root, file, target, mode: genoaMode } = readGenoaEnvironment('development')
const kit = await resolveKitTarget({ root, file, target, mode: genoaMode })

const kitPlugins = await sveltekit({
  preprocess: vitePreprocess(),
  adapter: kit.adapter as Adapter | undefined,
  ...(kit.origin === undefined ? {} : { paths: { origin: kit.origin } }),
  experimental: { remoteFunctions: true }
})

export default defineConfig({
  plugins: [genoa(), tailwindcss(), kitPlugins],
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
