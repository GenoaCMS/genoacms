import { defineConfig } from 'vitest/config'

/**
 * The SDK needs no configuration to run; the attack demonstration needs one to *compile* with.
 *
 * `attacks.author.test.ts` puts a hostile component through the real language adapter, and the
 * adapter resolves its own compilation target from `genoa.config` relative to the working
 * directory. `test/genoa.config` is the minimum that answers that lookup — see the file.
 */
export default defineConfig({
  test: {
    env: {
      GENOA_CONFIG_PATH: 'test/genoa.config'
    }
  }
})
