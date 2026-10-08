import { defineConfig } from 'vitest/config'

/** `test/types/` holds type-level tests for `tsc` (`pnpm run check`); vitest runs the runtime ones, and the `.test-d.ts` type tests in `src/`. */
export default defineConfig({
  test: {
    include: ['test/*.test.js'],
    typecheck: {
      enabled: true,
      include: ['src/**/*.test-d.ts'],
      tsconfig: 'tsconfig.test-d.json'
    }
  }
})
