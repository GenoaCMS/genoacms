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
  testMatch: /(.+\.)?(test|spec)\.[jt]s/,

  /**
   * The demo scenarios are excluded from an ordinary run, and are the *only* thing a demo run does.
   *
   * `demoFixtures.spec.ts` publishes the content the consumer demos render and removes none of it;
   * `demoCleanup.spec.ts` removes it. Neither asserts a product behaviour, and running them with the
   * suite would leave a bucket full of content after every run — or, worse, delete a demo somebody
   * was looking at.
   *
   * **Selected by tag rather than by filename**, so a scenario cannot rejoin the default run by being
   * renamed, and switched by an environment variable rather than by a command-line grep: Playwright
   * applies `grep` and `grepInvert` together, so a config that excluded the tag would cancel any
   * `--grep` trying to ask for it. `pnpm run test:demo` sets it.
   */
  ...(process.env.GENOACMS_DEMO === '1' ? { grep: /@demo/ } : { grepInvert: /@demo/ }),

  /**
   * One retry, because these tests drive real cloud storage.
   *
   * Object listing and read-after-write are eventually consistent, so a write can succeed and the
   * next read still miss it — most visibly when creating a page and immediately opening its editor,
   * which renders a 500 rather than the page. The helpers retry the reads that are known to lag;
   * this covers the rest without hiding anything, since Playwright reports a retried pass as
   * **flaky** rather than as a clean run.
   *
   * A test that fails twice is a real failure. If the flaky count starts climbing, the answer is to
   * find which read is lagging, not to raise this number.
   */
  retries: 1
}

export default config
