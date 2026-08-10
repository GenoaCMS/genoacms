import type { PlaywrightTestConfig } from '@playwright/test'

const config: PlaywrightTestConfig = {
  webServer: {
    // pnpm, not npm — this is a workspace package.
    // Note `build` authenticates against the configured provider, so these
    // tests need genoa.config credentials present. See tests/README.md.
    command: 'pnpm run build && pnpm run preview',
    port: 4173,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000
  },
  testDir: 'tests',
  testMatch: /(.+\.)?(test|spec)\.[jt]s/
}

export default config
