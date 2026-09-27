import { defineConfig } from 'vitest/config'

/** `test/types/` holds type-level tests for `tsc` (`pnpm run check`); vitest runs only the runtime ones. */
export default defineConfig({
  test: {
    include: ['src/**/*.test.ts']
  }
})
