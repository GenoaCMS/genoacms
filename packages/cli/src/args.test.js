import { test, describe } from 'vitest'
import assert from 'node:assert/strict'
import { parseCliArgs } from './args.js'

describe('parseCliArgs', () => {
  test('reads the command, the target and every flag', () => {
    assert.deepEqual(parseCliArgs(['build', 'gcp', '--config', 'x.ts', '--no-inline']), {
      command: 'build', target: 'gcp', config: 'x.ts', mode: undefined, noInline: true
    })
  })

  test('keeps run as an alias of dev', () => {
    assert.equal(parseCliArgs(['run']).command, 'dev')
  })

  test('refuses a mode that is neither development nor production', () => {
    assert.throws(() => parseCliArgs(['build', '--mode', 'staging']), /^Error: cli\/invalid-mode/)
  })

  test('refuses an unknown flag', () => {
    assert.throws(() => parseCliArgs(['build', '--nope']))
  })
})
