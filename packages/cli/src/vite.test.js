import { test, describe, vi, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import { spawnVite, runCoreScript } from './vite.js'

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

function coreWithViteServer () {
  const coreDir = coreWithVite()
  writeFileSync(join(coreDir, 'node_modules', 'vite', 'package.json'), JSON.stringify({ name: 'vite', version: '6.0.0', type: 'module', exports: './index.js' }))
  writeFileSync(join(coreDir, 'node_modules', 'vite', 'index.js'), `export async function createServer () {
  return {
    ssrLoadModule: async () => { globalThis.genoaScriptEnvironment = { ...process.env } },
    close: async () => {}
  }
}
`)
  return coreDir
}

function withShellEnvironment (shell, run) {
  const saved = { ...process.env }
  Object.assign(process.env, shell)
  const restore = () => {
    for (const key of Object.keys(process.env)) if (!Object.hasOwn(saved, key)) delete process.env[key]
    Object.assign(process.env, saved)
  }
  return Promise.resolve().then(run).finally(restore)
}

const SHELL_GENOA = { GENOA_CONFIG: '/shell/genoa.config.ts', GENOA_TARGET: 'aws', GENOA_STRAY: 'x' }

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

  test.fails('CLI-5: removes the shell\'s GENOA_* variables that it does not set', async () => {
    const env = { GENOA_PROJECT: '/p', GENOA_MODE: 'development' }

    const coreDir = coreWithVite()
    spawn.mockClear()
    exitingWith(0)
    await withShellEnvironment(SHELL_GENOA, () => spawnVite(coreDir, ['dev', '--host'], env))
    const spawned = spawn.mock.calls[0][2].env
    for (const key of Object.keys(SHELL_GENOA)) assert.equal(Object.hasOwn(spawned, key), false, key)
    assert.equal(spawned.GENOA_PROJECT, '/p')
    assert.equal(spawned.GENOA_MODE, 'development')
    assert.equal(spawned.PATH, process.env.PATH)

    const serverCore = coreWithViteServer()
    delete globalThis.genoaScriptEnvironment
    await withShellEnvironment(SHELL_GENOA, () => runCoreScript(serverCore, 'scripts/rotate-root.ts', env))
    const during = globalThis.genoaScriptEnvironment
    for (const key of Object.keys(SHELL_GENOA)) assert.equal(Object.hasOwn(during, key), false, key)
    assert.equal(during.GENOA_PROJECT, '/p')
    assert.equal(during.GENOA_MODE, 'development')
  })
})
