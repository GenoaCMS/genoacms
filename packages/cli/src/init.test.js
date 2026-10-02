import { test, describe, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { initTemplateValues, renderTemplate, prepareConfig } from './init.js'

const TEMPLATE_NAMES = ['development.ts', 'production.ts', 'collections.ts', 'authorization.ts', 'security.ts', 'languages.ts']
const template = (name) => readFileSync(new URL(`./templates/${name}`, import.meta.url), 'utf-8')
const rendered = (name, suite) => renderTemplate(template(name), initTemplateValues(suite, 'array'))

const roots = []
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }) })

function emptyDirectory () {
  const root = mkdtempSync(join(tmpdir(), 'genoa-cli-init-'))
  roots.push(root)
  return root
}

const snapshot = (root) => Object.fromEntries([
  ...TEMPLATE_NAMES.map(name => [name, readFileSync(join(root, 'genoa.config', name), 'utf-8')]),
  ['.gitignore', readFileSync(join(root, '.gitignore'), 'utf-8')]
])

describe('the rendered templates', () => {
  for (const suite of ['gcp', 'aws', null]) {
    test(`leave no placeholder for the ${suite ?? 'no'} suite`, () => {
      for (const name of TEMPLATE_NAMES) assert.doesNotMatch(rendered(name, suite), /%[a-z]+%/, name)
    })
  }

  test('give GCP its secrets store and deployment target', () => {
    const production = rendered('production.ts', 'gcp')
    assert.match(production, /'@genoacms\/adapter-gcp\/secrets'/)
    assert.match(production, /'@genoacms\/adapter-gcp\/deployment'/)
  })

  test('leave the AWS secrets store to do, since the suite has none', () => {
    const production = rendered('production.ts', 'aws')
    assert.match(production, /'TODO: secrets adapter'/)
    assert.match(production, /'@genoacms\/adapter-aws\/deployment'/)
  })

  test('leave storage and database to do without a suite', () => {
    const development = rendered('development.ts', null)
    assert.match(development, /'TODO: storage adapter'/)
    assert.match(development, /'TODO: database adapter'/)
  })
})

describe('prepareConfig', () => {
  test('writes the six files and ignores .genoacms/ once', async () => {
    const root = emptyDirectory()
    await prepareConfig(root, initTemplateValues('gcp', 'array'))
    assert.deepEqual(readdirSync(join(root, 'genoa.config')).sort(), [...TEMPLATE_NAMES].sort())
    assert.equal(readFileSync(join(root, '.gitignore'), 'utf-8').split('\n').filter(line => line === '.genoacms/').length, 1)
  })

  test('refuses to run twice, and changes nothing', async () => {
    const root = emptyDirectory()
    await prepareConfig(root, initTemplateValues('gcp', 'array'))
    const before = snapshot(root)
    await assert.rejects(prepareConfig(root, initTemplateValues('aws', 'array')), /^Error: cli\/config-exists/)
    assert.deepEqual(snapshot(root), before)
  })
})
