import { test, describe, vi, beforeEach } from 'vitest'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { log } from '@clack/prompts'
import { loadConfig } from '@genoacms/config/load'
import { createRuntimePackage } from '@genoacms/config/build'
import { spawnVite } from './vite.js'
import { build, chooseTarget } from './build.js'

vi.mock('@clack/prompts', async (importOriginal) => ({ ...await importOriginal(), log: { warn: vi.fn(), info: vi.fn(), message: vi.fn() } }))
vi.mock('@genoacms/config/load', async (importOriginal) => ({ ...await importOriginal(), loadConfig: vi.fn() }))
vi.mock('@genoacms/config/build', () => ({ createRuntimePackage: vi.fn() }))
vi.mock('./vite.js', () => ({ spawnVite: vi.fn(), runCoreScript: vi.fn() }))

const manifestWith = (deployment) => ({ config: { deployment } })

beforeEach(() => { vi.clearAllMocks() })

describe('chooseTarget', () => {
  test('CLI-7: chooses the given target, else deployment.default, else the first', () => {
    const targets = { aws: { adapter: 'a', options: {} }, gcp: { adapter: 'g', options: {} } }
    assert.equal(chooseTarget(manifestWith({ targets, default: 'gcp' }), 'aws'), 'aws')
    assert.equal(chooseTarget(manifestWith({ targets, default: 'gcp' }), undefined), 'gcp')
    assert.equal(chooseTarget(manifestWith({ targets }), undefined), 'aws')
  })

  test('CLI-7: fails with config/no-deployment-target and config/unknown-target', () => {
    assert.throws(() => chooseTarget(manifestWith(undefined), undefined), (error) => {
      assert.equal(error.code, 'config/no-deployment-target')
      assert.deepEqual(error.issues.map(issue => issue.code), ['config/no-deployment-target'])
      assert.match(error.message, /^config\/no-deployment-target/)
      return true
    })
    assert.throws(() => chooseTarget(manifestWith({ targets: {} }), 'gcp'), { code: 'config/no-deployment-target' })
    const targets = { aws: { adapter: 'a', options: {} }, local: { adapter: 'l', options: {} } }
    assert.throws(() => chooseTarget(manifestWith({ targets }), 'gcp'), (error) => {
      assert.equal(error.code, 'config/unknown-target')
      assert.deepEqual(error.issues.map(issue => issue.message), ['gcp is not a deployment target; known: aws, local'])
      assert.equal(error.message, 'config/unknown-target:\n  - deployment.targets: gcp is not a deployment target; known: aws, local')
      return true
    })
  })
})

describe('build', () => {
  test('CLI-7: loads with the mode and forbids inline with --no-inline, then runs vite build and writes the runtime package', async () => {
    const manifest = manifestWith({ targets: { gcp: { adapter: 'g', options: {} } } })
    const order = []
    loadConfig.mockImplementation(async () => { order.push('load'); return manifest })
    spawnVite.mockImplementation(async () => { order.push('vite') })
    createRuntimePackage.mockImplementation(async () => { order.push('package'); return { blind: ['./dynamic.js'], vendored: ['local-adapter'] } })

    const root = '/project'
    const file = '/project/genoa.config/production.ts'
    const built = await build({ root, file, coreDir: '/core', target: undefined, mode: 'production', noInline: true })

    assert.deepEqual(order, ['load', 'vite', 'package'])
    assert.deepEqual(loadConfig.mock.calls[0][0], { root, file, mode: 'production', forbidInline: true })
    assert.deepEqual(spawnVite.mock.calls[0], ['/core', ['build'], {
      GENOA_PROJECT: root, GENOA_MODE: 'production', GENOA_CONFIG: file, GENOA_TARGET: 'gcp'
    }])
    const buildDir = join(root, '.genoacms', 'build')
    assert.deepEqual(createRuntimePackage.mock.calls[0][0], { buildDir, coreDir: '/core', root, manifest })
    assert.deepEqual(built, { manifest, target: 'gcp', buildDir })
    assert.ok(log.warn.mock.calls.some(([message]) => message === './dynamic.js'))
    assert.ok(log.info.mock.calls.some(([message]) => message.includes('local-adapter')))

    await build({ root, file: undefined, coreDir: '/core', target: 'gcp', mode: 'development', noInline: false })
    assert.deepEqual(loadConfig.mock.calls[1][0], { root, file: undefined, mode: 'development', forbidInline: false })
    assert.deepEqual(spawnVite.mock.calls[1][2], { GENOA_PROJECT: root, GENOA_MODE: 'development', GENOA_TARGET: 'gcp' })
  })
})
