import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRuntimePackage } from './index.js'
import type { Manifest } from '../manifest.js'

const roots: string[] = []
afterEach(() => { while (roots.length > 0) rmSync(roots.pop() as string, { recursive: true, force: true }) })

function fixture (adapterVersion = '0.9.0') {
  const root = mkdtempSync(join(tmpdir(), 'genoa-runtime-package-'))
  roots.push(root)
  const coreDir = join(root, 'node_modules', '@genoacms', 'core')
  const buildDir = join(root, '.genoacms', 'build')
  mkdirSync(coreDir, { recursive: true })
  mkdirSync(join(buildDir, 'server'), { recursive: true })
  writeFileSync(join(buildDir, 'server', 'index.js'), "import 'jose'\nimport '@genoacms/adapter-x/storage/runtime'\nconst load = (s) => import(s)\nexport { load }\n")
  for (const [name, version] of [['jose', '5.10.0'], ['@genoacms/adapter-x', '0.9.0'], ['vite', '7.3.6']]) {
    mkdirSync(join(root, 'node_modules', name), { recursive: true })
    writeFileSync(join(root, 'node_modules', name, 'package.json'), JSON.stringify({ name, version }))
  }
  const manifest = {
    adapters: {
      '@genoacms/adapter-x/storage': { kind: 'storage', runtime: '@genoacms/adapter-x/storage/runtime', secretOptions: {}, developmentOnly: false, package: '@genoacms/adapter-x', version: adapterVersion },
      '@genoacms/adapter-y/deployment': { kind: 'deployment', secretOptions: {}, developmentOnly: false, package: '@genoacms/adapter-y', version: '1.0.0' }
    }
  } as unknown as Manifest
  return { root, coreDir, buildDir, manifest }
}

describe('createRuntimePackage', { timeout: 30_000 }, () => {
  it('writes the scanned externals pinned, plus the runtime adapters vendored, and nothing else', async () => {
    const { root, coreDir, buildDir, manifest } = fixture()
    const { pkg, blind, vendored } = await createRuntimePackage({ buildDir, coreDir, root, manifest })
    const tarball = 'file:vendor/genoacms-adapter-x-0.9.0.tgz'
    expect(pkg).toEqual({
      name: 'genoacms-runtime',
      private: true,
      type: 'module',
      dependencies: { '@genoacms/adapter-x': tarball, jose: '5.10.0' },
      overrides: { '@genoacms/adapter-x': tarball }
    })
    expect(JSON.parse(readFileSync(join(buildDir, 'package.json'), 'utf-8'))).toEqual(pkg)
    expect(vendored).toEqual(['@genoacms/adapter-x'])
    expect(existsSync(join(buildDir, 'vendor', 'genoacms-adapter-x-0.9.0.tgz'))).toBe(true)
    expect(blind).toEqual(['server/index.js: import(<Identifier>)'])
  })

  it('refuses an adapter whose manifest version differs from the installed one', async () => {
    const { root, coreDir, buildDir, manifest } = fixture('0.1.0')
    await expect(createRuntimePackage({ buildDir, coreDir, root, manifest })).rejects.toThrow(/^build\/version-conflict: @genoacms\/adapter-x/)
  })
})
