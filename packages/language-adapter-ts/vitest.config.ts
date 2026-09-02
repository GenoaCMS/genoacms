import { defineConfig } from 'vitest/config'

/**
 * `getProvider` resolves `genoa.config` relative to the working directory, so the adapter needs a
 * configuration to read its own settings from. `test/genoa.config` is the minimum that registers
 * this adapter — see the file for what it deliberately leaves out.
 */
export default defineConfig({
  test: {
    env: {
      GENOA_CONFIG_PATH: 'test/genoa.config'
    }
  }
})
