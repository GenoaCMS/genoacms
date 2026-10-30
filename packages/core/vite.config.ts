import { sveltekit } from '@sveltejs/kit/vite'
import type { Adapter } from '@sveltejs/kit'
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte'
import { playwright } from '@vitest/browser-playwright'
import tailwindcss from '@tailwindcss/vite'
import { genoa } from '@genoacms/config/vite'
import { readGenoaEnvironment, resolveKitTarget } from '@genoacms/config/load'
import { configDefaults, defineConfig } from 'vitest/config'
import type { ViteUserConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

if (process.env.VITEST !== undefined) {
  process.env.GENOA_CONFIG ??= fileURLToPath(new URL('./genoa.config/test.ts', import.meta.url))
}

const BROWSER_TESTS = 'src/**/*.browser.test.ts'

const endToEndTests: ViteUserConfig['test'] = {
  include: ['e2e/**/*.test.ts'],
  globalSetup: ['e2e/globalSetup.ts'],
  fileParallelism: false
}

const unitTests: ViteUserConfig['test'] = {
  projects: [
    {
      extends: true,
      test: {
        name: 'node',
        include: ['src/**/*.{test,spec}.{js,ts}', 'evidence/**/*.{test,spec}.{js,ts}'],
        exclude: [...configDefaults.exclude, BROWSER_TESTS]
      }
    },
    {
      extends: true,
      test: {
        name: 'browser',
        include: [BROWSER_TESTS],
        browser: {
          enabled: true,
          provider: playwright(),
          headless: true,
          instances: [{ browser: 'chromium' }]
        }
      }
    }
  ]
}

const { root, file, target, mode: genoaMode } = readGenoaEnvironment('development')
const kit = await resolveKitTarget({ root, file, target, mode: genoaMode })

const kitPlugins = await sveltekit({
  preprocess: vitePreprocess(),
  adapter: kit.adapter as Adapter | undefined,
  ...(kit.origin === undefined ? {} : { paths: { origin: kit.origin } }),
  experimental: { remoteFunctions: true }
})

export default defineConfig(({ mode }) => ({
  plugins: [genoa(), tailwindcss(), kitPlugins],
  test: mode === 'e2e' ? endToEndTests : unitTests,
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
}))
