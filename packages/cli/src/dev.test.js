import { test, describe, vi, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import dev from './dev.js'

vi.mock('node:child_process', async (importOriginal) => ({ ...await importOriginal(), spawn: vi.fn() }))

const roots = []
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }) })

function coreWithVite () {
  const coreDir = mkdtempSync(join(tmpdir(), 'genoa-cli-dev-'))
  roots.push(coreDir)
  mkdirSync(join(coreDir, 'node_modules', 'vite', 'bin'), { recursive: true })
  writeFileSync(join(coreDir, 'package.json'), JSON.stringify({ name: '@genoacms/core', type: 'module' }))
  writeFileSync(join(coreDir, 'node_modules', 'vite', 'package.json'), JSON.stringify({ name: 'vite', version: '6.0.0', bin: { vite: 'bin/vite.js' } }))
  writeFileSync(join(coreDir, 'node_modules', 'vite', 'bin', 'vite.js'), '')
  return coreDir
}

function exitingWith (code) {
  spawn.mockImplementationOnce(() => {
    const child = new EventEmitter()
    setImmediate(() => child.emit('exit', code))
    return child
  })
}

describe('dev', () => {
  test('CLI-6: runs vite dev --host with core\'s Vite, in core', async () => {
    const coreDir = coreWithVite()

    exitingWith(0)
    await dev({ root: '/project', file: undefined, coreDir, mode: 'development' })

    const [command, args, options] = spawn.mock.calls.at(-1)
    assert.equal(command, process.execPath)
    assert.deepEqual(args, [join(coreDir, 'node_modules', 'vite', 'bin', 'vite.js'), 'dev', '--host'])
    assert.equal(options.cwd, coreDir)
  })
})
