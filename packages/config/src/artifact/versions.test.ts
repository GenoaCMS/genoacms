import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { installedVersion } from './versions.js'

const roots: string[] = []
afterEach(() => { while (roots.length > 0) rmSync(roots.pop() as string, { recursive: true, force: true }) })

function temp (): string {
  const root = mkdtempSync(join(tmpdir(), 'genoa-versions-'))
  roots.push(root)
  return root
}

function install (dir: string, name: string, version: string): void {
  mkdirSync(join(dir, name), { recursive: true })
  writeFileSync(join(dir, name, 'package.json'), JSON.stringify({ name, version }))
}

describe('installedVersion', () => {
  it('finds a dependency below the directory, npm style', () => {
    const core = join(temp(), 'node_modules', '@genoacms', 'core')
    mkdirSync(core, { recursive: true })
    install(join(core, '..', '..'), 'jose', '5.10.0')
    expect(installedVersion('jose', core)).toBe('5.10.0')
  })

  it('finds a sibling inside a pnpm store directory', () => {
    const store = join(temp(), 'node_modules', '.pnpm', '@genoacms+core@1.0.0', 'node_modules')
    const core = join(store, '@genoacms', 'core')
    mkdirSync(core, { recursive: true })
    install(store, '@noble/hashes', '2.3.0')
    expect(installedVersion('@noble/hashes', core)).toBe('2.3.0')
  })

  it('throws for a package that is not installed', () => {
    expect(() => installedVersion('not-there', temp())).toThrow(/^build\/not-installed: not-there/)
  })
})
