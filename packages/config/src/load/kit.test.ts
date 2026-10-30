import { describe, it, expect, afterEach } from 'vitest'
import { join } from 'node:path'
import { resolveKitAdapter } from './kit.js'
import * as kit from './kit.js'
import { clearLoadCache } from './index.js'
import { makeProject, baseConfig, configSource, fakeAdapters, type FakePackage } from '../testing/fixtures.js'

const cleanups: Array<() => void> = []
afterEach(() => {
  clearLoadCache()
  while (cleanups.length > 0) cleanups.pop()?.()
})

/** A deployment adapter whose SvelteKit adapter is loaded from its own package and echoes its options. */
const kitPackage = (name: string, members = ''): FakePackage => ({
  exports: { '.': './descriptor.js' },
  files: {
    'descriptor.js': `export default {
      kind: 'deployment',
      secretOptions: { credentials: 'json' },
      svelteKitAdapter: async () => await import('./kit.js'),
      svelteKitOptions: (options, { outDir }) => ({ out: outDir, received: options, target: '${name}' }),
      procedure: async () => ({ default: async () => {} })${members}
    }\n`,
    'kit.js': "export default (options) => ({ name: 'fake-kit', adapt: () => {}, options })\n"
  }
})

function project (config: unknown) {
  const created = makeProject({ config: configSource(config), packages: { ...fakeAdapters(), 'kit-one': kitPackage('one'), 'kit-two': kitPackage('two'), 'kit-origin': kitPackage('origin', ',\n      origin: (options) => options.site') } })
  cleanups.push(created.cleanup)
  return created
}

const withTargets = (deployment: unknown): Record<string, any> => ({ ...baseConfig(), deployment })

describe('resolveKitAdapter', () => {
  it("gives the descriptor's SvelteKit adapter the artifact directory and the unresolved options", async () => {
    const credentials = { $secret: 'DEPLOY_SA' }
    const { root } = project(withTargets({ targets: { one: { adapter: 'kit-one', options: { credentials } } } }))
    const adapter = await resolveKitAdapter({ root, mode: 'development' }) as any
    expect(adapter.name).toBe('fake-kit')
    expect(adapter.options).toEqual({ out: join(root, '.genoacms', 'build'), received: { credentials }, target: 'one' })
  })

  it('chooses the requested target, then the default, then the first key', async () => {
    const targets = { one: { adapter: 'kit-one', options: {} }, two: { adapter: 'kit-two', options: {} } }
    const first = project(withTargets({ targets }))
    expect(((await resolveKitAdapter({ root: first.root, mode: 'development' })) as any).options.target).toBe('one')
    expect(((await resolveKitAdapter({ root: first.root, mode: 'development', target: 'two' })) as any).options.target).toBe('two')
    clearLoadCache()
    const byDefault = project(withTargets({ targets, default: 'two' }))
    expect(((await resolveKitAdapter({ root: byDefault.root, mode: 'development' })) as any).options.target).toBe('two')
  })

  it('refuses an unknown target and a target requested from a config without any', async () => {
    const withOne = project(withTargets({ targets: { one: { adapter: 'kit-one', options: {} } } }))
    await expect(resolveKitAdapter({ root: withOne.root, mode: 'development', target: 'nowhere' })).rejects.toMatchObject({ code: 'config/unknown-target' })
    const config = baseConfig()
    delete config.deployment
    const withNone = project(config)
    await expect(resolveKitAdapter({ root: withNone.root, mode: 'development', target: 'one' })).rejects.toMatchObject({ code: 'config/no-deployment-target' })
    await expect(resolveKitAdapter({ root: withNone.root, mode: 'development' })).resolves.toBeUndefined()
  })
})

const resolveKitTarget = async (request: Parameters<typeof resolveKitAdapter>[0]): Promise<any> =>
  await (kit as unknown as { resolveKitTarget: (request: unknown) => Promise<unknown> }).resolveKitTarget(request)

describe('resolveKitTarget', () => {
  it.fails("gives the descriptor's SvelteKit adapter the artifact directory and the unresolved options", async () => {
    const credentials = { $secret: 'DEPLOY_SA' }
    const { root } = project(withTargets({ targets: { one: { adapter: 'kit-one', options: { credentials } } } }))
    const { adapter } = await resolveKitTarget({ root, mode: 'development' })
    expect(adapter.name).toBe('fake-kit')
    expect(adapter.options).toEqual({ out: join(root, '.genoacms', 'build'), received: { credentials }, target: 'one' })
  })

  it.fails('chooses the requested target, then the default, then the first key', async () => {
    const targets = { one: { adapter: 'kit-one', options: {} }, two: { adapter: 'kit-two', options: {} } }
    const first = project(withTargets({ targets }))
    expect((await resolveKitTarget({ root: first.root, mode: 'development' })).adapter.options.target).toBe('one')
    expect((await resolveKitTarget({ root: first.root, mode: 'development', target: 'two' })).adapter.options.target).toBe('two')
    clearLoadCache()
    const byDefault = project(withTargets({ targets, default: 'two' }))
    expect((await resolveKitTarget({ root: byDefault.root, mode: 'development' })).adapter.options.target).toBe('two')
  })

  it.fails('refuses an unknown target and a target requested from a config without any', async () => {
    const withOne = project(withTargets({ targets: { one: { adapter: 'kit-one', options: {} } } }))
    await expect(resolveKitTarget({ root: withOne.root, mode: 'development', target: 'nowhere' })).rejects.toMatchObject({ code: 'config/unknown-target' })
    const config = baseConfig()
    delete config.deployment
    const withNone = project(config)
    await expect(resolveKitTarget({ root: withNone.root, mode: 'development', target: 'one' })).rejects.toMatchObject({ code: 'config/no-deployment-target' })
    expect((await resolveKitTarget({ root: withNone.root, mode: 'development' })).adapter).toBeUndefined()
  })

  it.fails("returns the descriptor's origin for the target's unresolved options", async () => {
    const targets = { with: { adapter: 'kit-origin', options: { site: 'https://cms.example' } }, without: { adapter: 'kit-origin', options: {} } }
    const { root } = project(withTargets({ targets }))
    expect((await resolveKitTarget({ root, mode: 'development', target: 'with' })).origin).toBe('https://cms.example')
    expect((await resolveKitTarget({ root, mode: 'development', target: 'without' })).origin).toBeUndefined()
  })

  it.fails('returns no origin from a descriptor that declares none', async () => {
    const { root } = project(withTargets({ targets: { one: { adapter: 'kit-one', options: {} } } }))
    const target = await resolveKitTarget({ root, mode: 'development' })
    expect(target.origin).toBeUndefined()
    expect(target.adapter.name).toBe('fake-kit')
  })

  it.fails('returns neither adapter nor origin without targets', async () => {
    const config = baseConfig()
    delete config.deployment
    const { root } = project(config)
    expect(await resolveKitTarget({ root, mode: 'development' })).toEqual({ adapter: undefined, origin: undefined })
  })
})
