import { test, describe, vi, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { spawnVite } from './vite.js'

vi.mock('node:child_process', async (importOriginal) => ({ ...await importOriginal(), spawn: vi.fn() }))

const roots = []
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }) })

function coreWithVite () {
  const coreDir = mkdtempSync(join(tmpdir(), 'genoa-cli-vite-'))
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

describe('spawnVite', () => {
  test('CLI-5: runs core\'s Vite in core, and fails with cli/vite-failed on a non-zero exit', async () => {
    const coreDir = coreWithVite()
    const env = { GENOA_PROJECT: '/p', GENOA_MODE: 'production', GENOA_TARGET: 'gcp' }

    exitingWith(0)
    await spawnVite(coreDir, ['build'], env)
    const [command, args, options] = spawn.mock.calls[0]
    assert.equal(command, process.execPath)
    assert.deepEqual(args, [join(coreDir, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'])
    assert.equal(options.cwd, coreDir)
    assert.equal(options.env.GENOA_PROJECT, '/p')
    assert.equal(options.env.GENOA_MODE, 'production')
    assert.equal(options.env.GENOA_TARGET, 'gcp')

    exitingWith(2)
    await assert.rejects(spawnVite(coreDir, ['dev', '--host'], env), { message: 'cli/vite-failed: vite dev --host exited with 2' })
  })
})
