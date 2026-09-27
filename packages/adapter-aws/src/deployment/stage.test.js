import { describe, it, expect, vi, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stageLambdaApp } from './stage.js'

const roots = []
afterEach(() => { while (roots.length > 0) rmSync(roots.pop(), { recursive: true, force: true }) })

function artifact (withPackage = true) {
  const root = mkdtempSync(join(tmpdir(), 'genoa-aws-stage-'))
  roots.push(root)
  const buildDir = join(root, 'build')
  mkdirSync(buildDir)
  writeFileSync(join(buildDir, 'index.js'), '// adapter-node server entry\n')
  writeFileSync(join(buildDir, 'handler.js'), 'export const handler = () => {}\n')
  if (withPackage) writeFileSync(join(buildDir, 'package.json'), JSON.stringify({ name: 'genoacms-runtime', type: 'module', dependencies: { jose: '5.10.0' } }))
  return { buildDir, app: join(root, 'app') }
}

describe('staging the Lambda app', () => {
  it('replaces the server entry with the wrapper, merges its dependency and installs once', async () => {
    const { buildDir, app } = artifact()
    const install = vi.fn(async () => {})
    await stageLambdaApp(buildDir, app, install)
    expect(readFileSync(join(app, 'index.js'), 'utf-8')).toContain('aws-serverless-express')
    const pkg = JSON.parse(readFileSync(join(app, 'package.json'), 'utf-8'))
    expect(pkg.main).toBe('index.js')
    expect(Object.keys(pkg.dependencies).sort()).toEqual(['aws-serverless-express', 'jose'])
    expect(install).toHaveBeenCalledOnce()
    expect(install).toHaveBeenCalledWith(app)
  })

  it('refuses an artifact without its runtime package.json', async () => {
    const { buildDir, app } = artifact(false)
    await expect(stageLambdaApp(buildDir, app, vi.fn())).rejects.toThrow(/^deploy\/no-runtime-package/)
  })
})
