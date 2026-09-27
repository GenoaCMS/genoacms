import { describe, it, expect } from 'vitest'
import { toRuntimeManifest, type Manifest } from './manifest.js'
import { baseConfig } from './testing/fixtures.js'

const manifest = (): Manifest => ({
  version: 1,
  mode: 'development',
  config: baseConfig() as Manifest['config'],
  adapters: {
    'fake-storage': { kind: 'storage', runtime: 'fake-storage/runtime', secretOptions: {}, developmentOnly: false, package: 'fake-storage', version: '1.0.0' },
    'fake-deployment': { kind: 'deployment', secretOptions: {}, developmentOnly: false, package: 'fake-deployment', version: '1.0.0' }
  },
  source: { root: '/project', file: '/project/genoa.config.ts', dependencies: ['/project/genoa.config.ts'] }
})

describe('toRuntimeManifest', () => {
  it('drops the deployment stanza, deployment adapters and the watch list', () => {
    const runtime = toRuntimeManifest(manifest())
    expect('deployment' in runtime.config).toBe(false)
    expect(Object.keys(runtime.adapters)).toEqual(['fake-storage'])
    expect(runtime.source).toEqual({ root: '/project', file: '/project/genoa.config.ts' })
  })

  it('omits source for a production manifest', () => {
    const { source, ...production } = manifest()
    expect(toRuntimeManifest({ ...production, mode: 'production' }).source).toBeUndefined()
  })

  it('does not mutate its input', () => {
    const input = manifest()
    const before = structuredClone(input)
    toRuntimeManifest(input)
    expect(input).toEqual(before)
  })
})
