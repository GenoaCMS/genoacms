import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['test/mutants/*.mutant.js']
  }
})
