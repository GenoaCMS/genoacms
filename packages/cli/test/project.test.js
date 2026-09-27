import { test, describe, after } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { resolveProject } from '../src/project.js'

const roots = []
after(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }) })

/** A throwaway directory holding the given files, each written as JSON. */
function directory (files) {
  const root = mkdtempSync(join(tmpdir(), 'genoa-cli-project-'))
  roots.push(root)
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(join(root, path, '..'), { recursive: true })
    writeFileSync(join(root, path), JSON.stringify(content))
  }
  return root
}

describe('resolveProject', () => {
  test('takes the project itself as core in the monorepo', () => {
    const root = directory({ 'package.json': { name: '@genoacms/core' } })
    assert.equal(resolveProject({ cwd: root }).coreDir, root)
  })

  test('finds the core a project has installed', () => {
    const root = directory({
      'package.json': { name: 'site' },
      'node_modules/@genoacms/core/package.json': { name: '@genoacms/core', version: '1.0.0' }
    })
    assert.equal(resolveProject({ cwd: root }).coreDir, join(root, 'node_modules', '@genoacms', 'core'))
  })

  test('says to install core when neither is true', () => {
    const root = directory({ 'package.json': { name: 'site' } })
    assert.throws(() => resolveProject({ cwd: root }), /^Error: cli\/core-not-installed/)
  })

  test('resolves --config against the working directory', () => {
    const root = directory({ 'package.json': { name: '@genoacms/core' } })
    const { root: projectRoot, file } = resolveProject({ cwd: root, config: 'genoa.config/production.ts' })
    assert.equal(projectRoot, root)
    assert.equal(file, join(root, 'genoa.config', 'production.ts'))
  })
})
