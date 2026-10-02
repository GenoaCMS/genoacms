import { test, describe } from 'vitest'
import assert from 'node:assert/strict'
import { genoaEnvironment } from './environment.js'

describe('genoaEnvironment', () => {
  test('CLI-5: sets only the facts that are defined', () => {
    assert.deepEqual(genoaEnvironment({ root: '/p', mode: 'development' }), { GENOA_PROJECT: '/p', GENOA_MODE: 'development' })
  })

  test('CLI-5: passes every value through unchanged', () => {
    assert.deepEqual(genoaEnvironment({ root: '/p', file: '/p/genoa.config/production.ts', target: 'gcp', mode: 'production' }), {
      GENOA_PROJECT: '/p', GENOA_MODE: 'production', GENOA_CONFIG: '/p/genoa.config/production.ts', GENOA_TARGET: 'gcp'
    })
  })

  test('CLI-5: never sets an empty value', () => {
    const facts = [
      { root: '/p', mode: 'development' },
      { root: '/p', file: undefined, target: undefined, mode: 'production' },
      { root: '/p', file: '/p/genoa.config/production.ts', mode: 'production' },
      { root: '/p', target: 'gcp', mode: 'production' }
    ]
    for (const fact of facts) {
      for (const [key, value] of Object.entries(genoaEnvironment(fact))) {
        assert.equal(typeof value, 'string', key)
        assert.notEqual(value, '', key)
      }
    }
  })
})
