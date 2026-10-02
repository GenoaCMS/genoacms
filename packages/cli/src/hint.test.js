import { test, describe, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { ConfigError } from '@genoacms/config'

const LOADED_DEVELOPMENT = 'The config loaded was genoa.config/development.ts, found by default; a production config is named explicitly.'

const roots = []
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }) })

function project (files) {
  const root = mkdtempSync(join(tmpdir(), 'genoa-cli-hint-'))
  roots.push(root)
  for (const path of files) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), 'export default {}\n')
  }
  return root
}

const developmentOnly = () => new ConfigError('config/invalid', [
  { code: 'config/development-only', path: 'secrets.providers.local.adapter', message: '@genoacms/adapter-secrets-env is for development only; a production build cannot use it' }
])

describe('productionConfigHint', () => {
  test.fails('CLI-19: names the default-found file and the production command', async () => {
    const { productionConfigHint } = await import('./hint.js')
    const root = project(['genoa.config/development.ts', 'genoa.config/production.ts'])
    assert.deepEqual(productionConfigHint({ root, command: 'deploy', target: 'gcp', error: developmentOnly() }), [
      LOADED_DEVELOPMENT,
      'Run: genoa deploy gcp --config genoa.config/production.ts'
    ])
  })

  test.fails('CLI-19: omits the Run line without genoa.config/production.ts, and the target when none was given', async () => {
    const { productionConfigHint } = await import('./hint.js')
    const single = project(['genoa.config.ts'])
    assert.deepEqual(productionConfigHint({ root: single, command: 'build', target: 'gcp', error: developmentOnly() }), [
      'The config loaded was genoa.config.ts, found by default; a production config is named explicitly.'
    ])
    const development = project(['genoa.config/development.ts'])
    assert.deepEqual(productionConfigHint({ root: development, command: 'deploy', target: 'gcp', error: developmentOnly() }), [
      LOADED_DEVELOPMENT
    ])
    const both = project(['genoa.config/development.ts', 'genoa.config/production.ts'])
    assert.deepEqual(productionConfigHint({ root: both, command: 'build', target: undefined, error: developmentOnly() }), [
      LOADED_DEVELOPMENT,
      'Run: genoa build --config genoa.config/production.ts'
    ])
  })

  test.fails('CLI-19: gives no hint for other errors', async () => {
    const { productionConfigHint } = await import('./hint.js')
    const root = project(['genoa.config/development.ts', 'genoa.config/production.ts'])
    const others = [
      new ConfigError('config/invalid', [{ code: 'config/inline-forbidden', path: 'storage.providers.gcs.options.credentials', message: 'is inline' }]),
      new ConfigError('config/unknown-target', [{ code: 'config/unknown-target', path: 'deployment.targets', message: 'aws is not a deployment target; known: gcp' }]),
      new ConfigError('config/development-only', []),
      new Error('config/development-only: not a ConfigError'),
      new Error('cli/vite-failed: vite build exited with 1')
    ]
    for (const error of others) {
      assert.equal(productionConfigHint({ root, command: 'deploy', target: 'gcp', error }), undefined, error.message)
    }
  })
})
