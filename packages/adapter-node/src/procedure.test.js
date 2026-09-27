import { describe, it, expect, afterEach, vi } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import procedure from './procedure.js'

const roots = []
afterEach(() => {
  vi.restoreAllMocks()
  while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true })
})

function context () {
  const projectRoot = mkdtempSync(join(tmpdir(), 'genoa-node-deploy-'))
  roots.push(projectRoot)
  const buildDir = join(projectRoot, '.genoacms', 'build')
  mkdirSync(join(buildDir, 'client'), { recursive: true })
  writeFileSync(join(buildDir, 'index.js'), 'export {}\n')
  writeFileSync(join(buildDir, 'package.json'), '{"name":"genoacms-runtime"}\n')
  writeFileSync(join(buildDir, 'client', 'x'), 'x')
  return { projectRoot, buildDir, workDir: join(projectRoot, '.genoacms', 'deploy', 'local'), target: 'local' }
}

describe('the Node deploy procedure', () => {
  it('copies the artifact to build/ and leaves unrelated files there alone', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    const ctx = context()
    mkdirSync(join(ctx.projectRoot, 'build'))
    writeFileSync(join(ctx.projectRoot, 'build', 'keep.txt'), 'mine')
    await procedure({}, ctx)
    expect(readFileSync(join(ctx.projectRoot, 'build', 'package.json'), 'utf-8')).toContain('genoacms-runtime')
    expect(existsSync(join(ctx.projectRoot, 'build', 'client', 'x'))).toBe(true)
    expect(readFileSync(join(ctx.projectRoot, 'build', 'keep.txt'), 'utf-8')).toBe('mine')
  })

  it('refuses a target outside the project even when validation was bypassed', async () => {
    await expect(procedure({ outDir: '../x' }, context())).rejects.toThrow('deploy/out-dir-outside-project')
  })
})
