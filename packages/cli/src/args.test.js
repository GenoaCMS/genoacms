import { test, describe } from 'vitest'
import assert from 'node:assert/strict'
import { parseCliArgs } from './args.js'

describe('parseCliArgs', () => {
  test('CLI-1: reads the command, the target and every flag', () => {
    assert.deepEqual(parseCliArgs(['build', 'gcp', '--config', 'x.ts', '--no-inline']), {
      command: 'build', target: 'gcp', config: 'x.ts', mode: undefined, noInline: true, help: false, version: false
    })
    assert.equal(parseCliArgs(['-h']).help, true)
    assert.equal(parseCliArgs(['deploy', '--help']).help, true)
    assert.equal(parseCliArgs(['-v']).version, true)
    assert.equal(parseCliArgs(['--version']).version, true)
    assert.equal(parseCliArgs(['deploy', '--help']).command, 'deploy')
  })

  test('CLI-1: keeps run as an alias of dev', () => {
    assert.equal(parseCliArgs(['run']).command, 'dev')
  })

  test('CLI-1: reads -c and -m as --config and --mode', () => {
    const args = parseCliArgs(['deploy', 'gcp', '-c', 'genoa.config/production.ts', '-m', 'production'])
    assert.equal(args.config, 'genoa.config/production.ts')
    assert.equal(args.mode, 'production')
  })

  test('CLI-1: replaces dev and prod with development and production', () => {
    assert.equal(parseCliArgs(['build', '-m', 'dev']).mode, 'development')
    assert.equal(parseCliArgs(['build', '--mode', 'prod']).mode, 'production')
  })

  test('CLI-1: refuses a mode that is neither development nor production', () => {
    assert.throws(() => parseCliArgs(['build', '--mode', 'staging']), /^Error: cli\/invalid-mode/)
    assert.throws(() => parseCliArgs(['build', '--mode', 'staging']), {
      message: 'cli/invalid-mode: --mode must be development (dev) or production (prod), not staging'
    })
    assert.throws(() => parseCliArgs(['build', '--mode', 'Dev']), {
      message: 'cli/invalid-mode: --mode must be development (dev) or production (prod), not Dev'
    })
  })

  test('CLI-1: refuses an unknown flag, and --config or --mode without a value', () => {
    assert.throws(() => parseCliArgs(['build', '--nope']), { code: 'ERR_PARSE_ARGS_UNKNOWN_OPTION' })
    assert.throws(() => parseCliArgs(['build', '--config']), { code: 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE' })
    assert.throws(() => parseCliArgs(['build', '--mode']), { code: 'ERR_PARSE_ARGS_INVALID_OPTION_VALUE' })
  })

  test.fails('CLI-1: refuses an empty --config', () => {
    assert.throws(() => parseCliArgs(['build', '-c', '']), { message: 'cli/invalid-config: --config must name a file' })
    assert.throws(() => parseCliArgs(['build', '--config=']), { message: 'cli/invalid-config: --config must name a file' })
  })

  test('CLI-1: ignores further positionals', () => {
    assert.deepEqual(parseCliArgs(['deploy', 'gcp', 'extra', 'more', '-m', 'prod']), {
      command: 'deploy', target: 'gcp', config: undefined, mode: 'production', noInline: false, help: false, version: false
    })
  })
})
