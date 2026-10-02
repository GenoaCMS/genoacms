import { test, describe, vi, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import { select } from '@clack/prompts'

vi.mock('@clack/prompts', async (importOriginal) => ({ ...await importOriginal(), select: vi.fn() }))

const restorers = []
afterAll(() => { for (const restore of restorers) restore() })

function overrideProperty (target, key, value) {
  const original = Object.getOwnPropertyDescriptor(target, key)
  Object.defineProperty(target, key, { value, configurable: true, writable: true })
  restorers.push(() => original === undefined ? delete target[key] : Object.defineProperty(target, key, original))
}

describe('the command table', () => {
  test.fails('CLI-2: declares every command once, in the menu\'s order, with its default mode', async () => {
    const { COMMANDS } = await import('./commands.js')
    assert.deepEqual(COMMANDS.map(command => [command.name, command.mode ?? null]), [
      ['init', null],
      ['dev', 'development'],
      ['build', 'production'],
      ['deploy', 'production'],
      ['database', 'development'],
      ['roles', 'development'],
      ['rotate-root', 'development']
    ])
  })

  test.fails('CLI-18: the menu offers every command, then Exit', async () => {
    const { COMMANDS } = await import('./commands.js')
    select.mockResolvedValue('exit')
    overrideProperty(process, 'argv', [process.execPath, 'genoa'])
    overrideProperty(process.stdin, 'isTTY', true)
    overrideProperty(process.stdout, 'isTTY', true)
    overrideProperty(process, 'exit', vi.fn())

    await import('./index.js')
    await vi.waitFor(() => assert.equal(select.mock.calls.length, 1))

    const { options } = select.mock.calls[0][0]
    assert.deepEqual(options.map(option => option.label), [...COMMANDS.map(command => command.name), 'Exit'])
    assert.deepEqual(options.slice(0, -1).map(option => option.hint), COMMANDS.map(command => command.summary))
    assert.equal(process.exit.mock.calls.some(([code]) => code !== undefined && code !== 0), false)
  })
})
