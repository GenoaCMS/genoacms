import { sveltekit } from '@sveltejs/kit/vite'
import tailwindcss from '@tailwindcss/vite'
import { genoa } from '@genoacms/config/vite'
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
          provider: 'playwright',
          headless: true,
          instances: [{ browser: 'chromium' }]
        }
      }
    }
  ]
}

export default defineConfig(({ mode }) => ({
  plugins: [genoa(), tailwindcss(), sveltekit()],
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
