import { describe, it, expect, afterEach, vi } from 'vitest'
import { writeFileSync } from 'node:fs'
import { createServer, type ViteDevServer } from 'vite'
import { genoa } from './index.js'
import { clearLoadCache, loadConfig } from '../load/index.js'
import { makeProject, baseConfig, configSource, fakeAdapters } from '../testing/fixtures.js'

vi.mock('../load/evaluate.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../load/evaluate.js')>()
  return { ...actual, evaluateConfigModule: vi.fn(actual.evaluateConfigModule) }
})
const { evaluateConfigModule } = await import('../load/evaluate.js')

const cleanups: Array<() => Promise<void> | void> = []
afterEach(async () => {
  clearLoadCache()
  vi.mocked(evaluateConfigModule).mockClear()
  while (cleanups.length > 0) await cleanups.pop()?.()
})

function project () {
  const created = makeProject({ config: configSource(baseConfig()), packages: fakeAdapters() })
  cleanups.push(created.cleanup)
  return created
}

/** Runs the hooks the way Vite would for one resolution, returning the plugin. */
async function resolved (root: string, file: string, command: 'serve' | 'build') {
  const plugin = genoa({ root, file }) as any
  plugin.config({}, { command, mode: 'whatever' })
  await plugin.configResolved({})
  return plugin
}

describe('the genoa() plugin', () => {
  it('serves the runtime manifest: no deployment stanza, no deployment adapters', async () => {
    const { root, file } = project()
    const plugin = await resolved(root, file, 'serve')
    const id = plugin.resolveId('virtual:genoa/manifest')
    const code: string = plugin.load(id)
    const manifest = JSON.parse(code.replace(/^export const manifest = /, '').trim())
    expect('deployment' in manifest.config).toBe(false)
    expect(Object.values(manifest.adapters).map((record: any) => record.kind)).not.toContain('deployment')
    expect(manifest.mode).toBe('development')
    expect(manifest.source).toEqual({ root, file })
  })

  it('ignores other ids', async () => {
    const { root, file } = project()
    const plugin = await resolved(root, file, 'build')
    expect(plugin.resolveId('virtual:other')).toBeNull()
    expect(plugin.load('/some/file.ts')).toBeNull()
  })

  it('evaluates the config once however many times the Vite config is resolved', async () => {
    const { root, file } = project()
    const plugin = genoa({ root, file }) as any
    plugin.config({}, { command: 'build', mode: 'production' })
    for (let i = 0; i < 5; i++) await plugin.configResolved({})
    expect(evaluateConfigModule).toHaveBeenCalledTimes(1)
  })

  it('takes the mode from GENOA_MODE rather than from the Vite command', async () => {
    vi.stubEnv('GENOA_MODE', 'development')
    const { root, file } = project()
    const plugin = await resolved(root, file, 'build')
    expect(JSON.parse((plugin.load('\0virtual:genoa/manifest') as string).replace(/^export const manifest = /, '')).mode).toBe('development')
    vi.unstubAllEnvs()
  })
})

describe('the genoa() plugin in a dev server', () => {
  async function server (root: string, file: string): Promise<ViteDevServer> {
    const created = await createServer({
      root,
      configFile: false,
      logLevel: 'silent',
      appType: 'custom',
      server: { middlewareMode: true, hmr: false, watch: null },
      plugins: [genoa({ root, file })]
    })
    cleanups.push(async () => { await created.close() })
    return created
  }

  it('makes the manifest importable on the server', async () => {
    const { root, file } = project()
    const dev = await server(root, file)
    const { manifest } = await dev.ssrLoadModule('virtual:genoa/manifest')
    expect(manifest.config.storage.defaultBucket).toBe('genoacms')
  })

  it('restarts when the config changes, and the next load sees the edit', async () => {
    const { root, file } = project()
    const dev = await server(root, file)
    const restart = vi.spyOn(dev, 'restart').mockResolvedValue()
    const edited = baseConfig()
    edited.storage.buckets.extra = { provider: 'gcs' }
    writeFileSync(file, configSource(edited))
    dev.watcher.emit('change', file)
    expect(restart).toHaveBeenCalledTimes(1)
    const reloaded = await loadConfig({ root, file, mode: 'development' })
    expect(Object.keys(reloaded.config.storage.buckets)).toContain('extra')
  })

  it('ignores changes to files the config does not import', async () => {
    const { root, file } = project()
    const dev = await server(root, file)
    const restart = vi.spyOn(dev, 'restart').mockResolvedValue()
    dev.watcher.emit('change', `${root}/unrelated.ts`)
    expect(restart).not.toHaveBeenCalled()
  })
})
