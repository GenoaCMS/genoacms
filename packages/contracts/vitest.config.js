import { defineConfig } from 'vitest/config'

/** `test/types/` holds type-level tests for `tsc` (`pnpm run check`); vitest runs the runtime tests and the `.test-d.ts` type tests in `src/` (CF33). */
export default defineConfig({
  test: {
    include: ['src/**/*.test.js'],
    typecheck: {
      enabled: true,
      include: ['src/**/*.test-d.ts'],
      tsconfig: 'tsconfig.test-d.json'
    }
  }
})
