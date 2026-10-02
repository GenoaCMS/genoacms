import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { genoa } from '@genoacms/config/vite'
import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

if (process.env.VITEST !== undefined) {
  process.env.GENOA_CONFIG ??= fileURLToPath(new URL('./genoa.config/test.ts', import.meta.url))
}

export default defineConfig({
  plugins: [genoa(), tailwindcss(), sveltekit()],
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
