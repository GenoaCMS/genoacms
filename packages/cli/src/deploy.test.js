import { test, describe, vi, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadConfig, importFromProject } from '@genoacms/config/load'
import { createRuntimePackage } from '@genoacms/config/build'
import { createHost } from '@genoacms/config/host'
import { spawnVite } from './vite.js'
import deploy from './deploy.js'

const { spinners } = vi.hoisted(() => ({ spinners: [] }))

vi.mock('@clack/prompts', async (importOriginal) => ({
  ...await importOriginal(),
  log: { warn: vi.fn(), info: vi.fn(), message: vi.fn() },
  spinner: () => {
    const progress = { start: vi.fn(), stop: vi.fn(), message: vi.fn() }
    spinners.push(progress)
    return progress
  }
}))
vi.mock('@genoacms/config/load', async (importOriginal) => ({ ...await importOriginal(), loadConfig: vi.fn(), importFromProject: vi.fn() }))
vi.mock('@genoacms/config/build', () => ({ createRuntimePackage: vi.fn() }))
vi.mock('@genoacms/config/host', () => ({ createHost: vi.fn() }))
vi.mock('./vite.js', () => ({ spawnVite: vi.fn(), runCoreScript: vi.fn() }))

const roots = []
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }) })

describe('deploy', () => {
  test('CLI-8: resolves the target\'s options through a host, runs the procedure in an emptied work directory, and closes the host even when the procedure fails', async () => {
    const root = mkdtempSync(join(tmpdir(), 'genoa-cli-deploy-'))
    roots.push(root)
    const workDir = join(root, '.genoacms', 'deploy', 'gcp')
    mkdirSync(workDir, { recursive: true })
    writeFileSync(join(workDir, 'stale.txt'), 'left over')

    const options = { region: 'europe-west1', credentials: { $secret: 'GCP_SA' } }
    const manifest = { config: { deployment: { targets: { gcp: { adapter: 'fake-deployment', options } } } } }
    const resolved = { region: 'europe-west1', credentials: { client_email: 'x' } }
    const seen = {}
    const procedure = vi.fn(async (_options, ctx) => {
      seen.workDirContents = readdirSync(ctx.workDir)
      throw new Error('procedure failed')
    })
    const descriptor = { kind: 'deployment', secretOptions: { credentials: 'json' }, procedure: async () => ({ default: procedure }) }
    const host = { resolve: vi.fn(async () => resolved), close: vi.fn(async () => {}) }

    loadConfig.mockResolvedValue(manifest)
    spawnVite.mockResolvedValue(undefined)
    createRuntimePackage.mockResolvedValue({ blind: [], vendored: [] })
    importFromProject.mockImplementation(async (specifier) => {
      assert.equal(specifier, 'fake-deployment')
      return { default: descriptor }
    })
    createHost.mockReturnValue(host)

    await assert.rejects(deploy({ root, file: join(root, 'genoa.config', 'production.ts'), coreDir: '/core', target: 'gcp', mode: 'production', noInline: false }), { message: 'procedure failed' })

    assert.equal(spawnVite.mock.calls.length, 1)
    assert.equal(createHost.mock.calls[0][0].manifest, manifest)
    assert.equal(createHost.mock.calls[0][0].projectRoot, root)
    assert.deepEqual(host.resolve.mock.calls[0], [options, { credentials: 'json' }, 'deployment.targets.gcp.options'])
    assert.deepEqual(procedure.mock.calls[0], [resolved, {
      projectRoot: root, buildDir: join(root, '.genoacms', 'build'), workDir, target: 'gcp'
    }])
    assert.deepEqual(seen.workDirContents, [])
    assert.equal(host.close.mock.calls.length, 1)
  })

  test.fails('CLI-8: a failed phase ends its progress line as failed', async () => {
    const root = mkdtempSync(join(tmpdir(), 'genoa-cli-deploy-'))
    roots.push(root)
    const failure = new Error('build failed')
    loadConfig.mockRejectedValue(failure)
    spawnVite.mockClear()
    createHost.mockClear()
    spinners.length = 0

    await assert.rejects(deploy({ root, file: join(root, 'genoa.config', 'production.ts'), coreDir: '/core', target: 'gcp', mode: 'production', noInline: false }), (error) => error === failure)

    assert.equal(spinners.length, 1)
    assert.deepEqual(spinners[0].start.mock.calls, [['Building CMS code']])
    assert.deepEqual(spinners[0].stop.mock.calls, [['Building CMS code failed', 2]])
    assert.equal(spawnVite.mock.calls.length, 0)
    assert.equal(createHost.mock.calls.length, 0)
  })
})
