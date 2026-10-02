import { test, describe } from 'vitest'
import assert from 'node:assert/strict'
import { genoaEnvironment } from './environment.js'

describe('genoaEnvironment', () => {
  test('sets only the facts that are defined', () => {
    assert.deepEqual(genoaEnvironment({ root: '/p', mode: 'development' }), { GENOA_PROJECT: '/p', GENOA_MODE: 'development' })
  })

  test('passes every value through unchanged', () => {
    assert.deepEqual(genoaEnvironment({ root: '/p', file: '/p/genoa.config/production.ts', target: 'gcp', mode: 'production' }), {
      GENOA_PROJECT: '/p', GENOA_MODE: 'production', GENOA_CONFIG: '/p/genoa.config/production.ts', GENOA_TARGET: 'gcp'
    })
  })
})
