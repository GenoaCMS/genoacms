import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync, existsSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { vendorPackages, type VendorRequest } from './vendor.js'

const roots: string[] = []
afterEach(() => { while (roots.length > 0) rmSync(roots.pop() as string, { recursive: true, force: true }) })

interface Pkg { name: string, version?: string, [field: string]: unknown }

/** A project whose node_modules holds registry-like directories and symlinks to local packages. */
function project () {
  const root = mkdtempSync(join(tmpdir(), 'genoa-vendor-'))
  roots.push(root)
  const buildDir = join(root, '.genoacms', 'build')
  mkdirSync(buildDir, { recursive: true })

  function write (dir: string, pkg: Pkg, files: Record<string, string> = {}): string {
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ version: '1.0.0', ...pkg }))
    for (const [path, content] of Object.entries(files)) {
      mkdirSync(dirname(join(dir, path)), { recursive: true })
      writeFileSync(join(dir, path), content)
    }
    return dir
  }

  /** A real directory under `<base>/node_modules`, as a registry install leaves it. */
  function registry (pkg: Pkg, base = root, files: Record<string, string> = {}): string {
    return write(join(base, 'node_modules', pkg.name), pkg, files)
  }

  /** A package outside any node_modules, linked into `<base>/node_modules`, as a workspace is. */
  function local (pkg: Pkg, base = root, files: Record<string, string> = {}): string {
    const dir = write(join(root, 'packages', pkg.name.replace('/', '__')), pkg, files)
    const link = join(base, 'node_modules', pkg.name)
    mkdirSync(dirname(link), { recursive: true })
    symlinkSync(dir, link, 'dir')
    return dir
  }

  const request = (fields: Partial<VendorRequest>): VendorRequest =>
    ({ buildDir, root, coreDir: root, adapters: [], scanned: [], ...fields })

  return { root, buildDir, registry, local, request }
}

const names = (vendored: Array<{ name: string }>): string[] => vendored.map(entry => entry.name)

describe('vendorPackages', { timeout: 30_000 }, () => {
  it('vendors an adapter installed from the registry', async () => {
    const { registry, request } = project()
    registry({ name: 'adapter-r' })
    expect(names(await vendorPackages(request({ adapters: ['adapter-r'] })))).toEqual(['adapter-r'])
  })

  it('follows a vendored package to its local dependencies, not to registry ones', async () => {
    const { local, registry, request } = project()
    const adapter = local({ name: 'adapter-l', dependencies: { 'lib-l': '^1.0.0', 'lib-r': '^1.0.0' } })
    local({ name: 'lib-l' }, adapter)
    registry({ name: 'lib-r' }, adapter)
    expect(names(await vendorPackages(request({ adapters: ['adapter-l'] })))).toEqual(['adapter-l', 'lib-l'])
  })

  it('vendors a scanned external only when it is local', async () => {
    const { local, registry, request } = project()
    local({ name: 'ext-l' })
    registry({ name: 'ext-r' })
    expect(names(await vendorPackages(request({ scanned: ['ext-l', 'ext-r'] })))).toEqual(['ext-l'])
  })

  it('does not follow devDependencies', async () => {
    const { local, request } = project()
    const adapter = local({ name: 'adapter-l', devDependencies: { 'dev-l': '^1.0.0' } })
    local({ name: 'dev-l' }, adapter)
    expect(names(await vendorPackages(request({ adapters: ['adapter-l'] })))).toEqual(['adapter-l'])
  })

  it('skips a missing peer dependency and refuses a missing regular one', async () => {
    const { local, request } = project()
    local({ name: 'with-peer', peerDependencies: { absent: '^1.0.0' } })
    expect(names(await vendorPackages(request({ adapters: ['with-peer'] })))).toEqual(['with-peer'])
    local({ name: 'with-dep', dependencies: { absent: '^1.0.0' } })
    await expect(vendorPackages(request({ adapters: ['with-dep'] }))).rejects.toThrow(/^build\/not-installed: absent/)
  })

  it('refuses one name installed from two directories', async () => {
    const { local, registry, request } = project()
    const adapter = local({ name: 'adapter-l', dependencies: { shared: '^1.0.0' } })
    local({ name: 'shared' }, adapter)
    const other = registry({ name: 'other-adapter', dependencies: { shared: '^1.0.0' } })
    const second = join(dirname(adapter), 'shared-copy')
    mkdirSync(second)
    writeFileSync(join(second, 'package.json'), JSON.stringify({ name: 'shared', version: '1.0.0' }))
    mkdirSync(join(other, 'node_modules'))
    symlinkSync(second, join(other, 'node_modules', 'shared'), 'dir')
    await expect(vendorPackages(request({ adapters: ['adapter-l', 'other-adapter'] }))).rejects.toThrow(/^build\/vendor-conflict: shared is installed from /)
  })

  it('refuses a package whose export target was never built, ignoring type declarations', async () => {
    const { local, request } = project()
    local({ name: 'unbuilt', exports: { '.': { types: './dist/index.d.ts', import: './dist/index.js' } } })
    await expect(vendorPackages(request({ adapters: ['unbuilt'] }))).rejects.toThrow(/^build\/vendor-incomplete: unbuilt lacks dist\/index\.js/)
    local({ name: 'untyped', exports: { '.': { types: './index.d.ts', import: './index.js' } } }, undefined, { 'index.js': '' })
    expect(names(await vendorPackages(request({ adapters: ['untyped'] })))).toEqual(['untyped'])
  })

  it('refuses a package that would ship a .env file, but not a .env.example', async () => {
    const { local, request } = project()
    local({ name: 'leaky' }, undefined, { '.env': 'X=1\n' })
    await expect(vendorPackages(request({ adapters: ['leaky'] }))).rejects.toThrow(/^build\/vendor-secret: leaky would ship \.env/)
    local({ name: 'tidy' }, undefined, { '.env.example': 'X=\n' })
    expect(names(await vendorPackages(request({ adapters: ['tidy'] })))).toEqual(['tidy'])
  })

  it('accepts workspace: on a vendored dependency and refuses it on one that is not', async () => {
    const { local, request } = project()
    const adapter = local({ name: 'adapter-w', dependencies: { 'lib-w': 'workspace:^' } })
    local({ name: 'lib-w' }, adapter)
    expect(names(await vendorPackages(request({ adapters: ['adapter-w'] })))).toEqual(['adapter-w', 'lib-w'])
    local({ name: 'adapter-c', peerDependencies: { 'lib-c': 'catalog:' } })
    await expect(vendorPackages(request({ adapters: ['adapter-c'] }))).rejects.toThrow(/^build\/vendor-protocol: adapter-c depends on lib-c@catalog:/)
  })

  it('returns packages sorted, each pointing at a tarball in vendor/', async () => {
    const { local, buildDir, request } = project()
    local({ name: 'zeta' })
    local({ name: '@scope/alpha', version: '2.0.0' })
    const vendored = await vendorPackages(request({ adapters: ['zeta', '@scope/alpha'] }))
    expect(vendored).toEqual([
      { name: '@scope/alpha', version: '2.0.0', filename: 'scope-alpha-2.0.0.tgz', spec: 'file:vendor/scope-alpha-2.0.0.tgz' },
      { name: 'zeta', version: '1.0.0', filename: 'zeta-1.0.0.tgz', spec: 'file:vendor/zeta-1.0.0.tgz' }
    ])
    for (const entry of vendored) expect(existsSync(join(buildDir, 'vendor', entry.filename))).toBe(true)
  })

  it('removes tarballs a previous run left behind', async () => {
    const { local, buildDir, request } = project()
    local({ name: 'first' })
    local({ name: 'second' })
    await vendorPackages(request({ adapters: ['first'] }))
    await vendorPackages(request({ adapters: ['second'] }))
    expect(readdirSync(join(buildDir, 'vendor'))).toEqual(['second-1.0.0.tgz'])
  })
})
