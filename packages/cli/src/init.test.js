import { test, describe, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
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
    test(`CLI-13: leave no placeholder for the ${suite ?? 'no'} suite`, () => {
      for (const name of TEMPLATE_NAMES) assert.doesNotMatch(rendered(name, suite), /%[a-z]+%/, name)
    })
  }

  test('CLI-13: give GCP its secrets store and deployment target', () => {
    const production = rendered('production.ts', 'gcp')
    assert.match(production, /'@genoacms\/adapter-gcp\/secrets'/)
    assert.match(production, /'@genoacms\/adapter-gcp\/deployment'/)
  })

  test('CLI-13: the AWS suite scaffolds @genoacms/adapter-aws/secrets', () => {
    assert.equal(initTemplateValues('aws', 'array').secrets, '@genoacms/adapter-aws/secrets')
    const production = rendered('production.ts', 'aws')
    assert.match(production, /'@genoacms\/adapter-aws\/secrets'/)
    assert.match(production, /'@genoacms\/adapter-aws\/deployment'/)
    assert.doesNotMatch(production, /TODO: secrets adapter/)
  })

  test('CLI-13: leave storage and database to do without a suite', () => {
    const development = rendered('development.ts', null)
    assert.match(development, /'TODO: storage adapter'/)
    assert.match(development, /'TODO: database adapter'/)
  })

  test('CLI-13: renders every value of the suites\' table', () => {
    const SUITE_VALUES = [
      ['gcp', { storage: '@genoacms/adapter-gcp/storage', database: '@genoacms/adapter-gcp/database', secrets: '@genoacms/adapter-gcp/secrets', deployment: '@genoacms/adapter-gcp/deployment', target: 'gcp' }],
      ['aws', { storage: '@genoacms/adapter-aws/storage', database: '@genoacms/adapter-aws/database', secrets: '@genoacms/adapter-aws/secrets', deployment: '@genoacms/adapter-aws/deployment', target: 'aws' }],
      [null, { storage: 'TODO: storage adapter', database: 'TODO: database adapter', secrets: 'TODO: secrets adapter', deployment: 'TODO: deployment adapter', target: 'cloud' }]
    ]
    const AUTHENTICATION_VALUES = [['array', '@genoacms/authentication-adapter-array'], [null, 'TODO: authentication adapter']]
    for (const [suite, values] of SUITE_VALUES) {
      for (const [authentication, adapter] of AUTHENTICATION_VALUES) {
        const expected = { ...values, authentication: adapter }
        assert.deepEqual(initTemplateValues(suite, authentication), expected, `${suite} ${authentication}`)
        const production = renderTemplate(template('production.ts'), initTemplateValues(suite, authentication))
        for (const value of Object.values(expected)) assert.ok(production.includes(`'${value}'`), `${suite} ${authentication}: ${value}`)
      }
    }
  })
})

describe('prepareConfig', () => {
  test('CLI-12: writes the six files and ignores .genoacms/ once', async () => {
    const root = emptyDirectory()
    await prepareConfig(root, initTemplateValues('gcp', 'array'))
    assert.deepEqual(readdirSync(join(root, 'genoa.config')).sort(), [...TEMPLATE_NAMES].sort())
    assert.equal(readFileSync(join(root, '.gitignore'), 'utf-8').split('\n').filter(line => line === '.genoacms/').length, 1)
  })

  test('CLI-12: refuses to run twice, and changes nothing', async () => {
    const root = emptyDirectory()
    await prepareConfig(root, initTemplateValues('gcp', 'array'))
    const before = snapshot(root)
    await assert.rejects(prepareConfig(root, initTemplateValues('aws', 'array')), /^Error: cli\/config-exists/)
    assert.deepEqual(snapshot(root), before)
  })

  test('CLI-12: refuses with cli/config-exists before writing anything', async () => {
    const root = emptyDirectory()
    mkdirSync(join(root, 'genoa.config'))
    writeFileSync(join(root, 'genoa.config', 'security.ts'), '// mine\n')
    const existing = join(root, 'genoa.config', 'security.ts')
    await assert.rejects(prepareConfig(root, initTemplateValues('gcp', 'array')), { message: `cli/config-exists: ${existing}` })
    assert.deepEqual(readdirSync(join(root, 'genoa.config')), ['security.ts'])
    assert.equal(readFileSync(existing, 'utf-8'), '// mine\n')
    assert.equal(existsSync(join(root, '.gitignore')), false)

    const single = emptyDirectory()
    writeFileSync(join(single, 'genoa.config.ts'), 'export default {}\n')
    await assert.rejects(prepareConfig(single, initTemplateValues('gcp', 'array')), { message: `cli/config-exists: ${join(single, 'genoa.config.ts')}` })
    assert.deepEqual(readdirSync(single), ['genoa.config.ts'])
  })

  test('CLI-12: appends .genoacms/ to .gitignore once', async () => {
    const unterminated = emptyDirectory()
    writeFileSync(join(unterminated, '.gitignore'), 'node_modules')
    await prepareConfig(unterminated, initTemplateValues(null, null))
    assert.equal(readFileSync(join(unterminated, '.gitignore'), 'utf-8'), 'node_modules\n.genoacms/\n')

    const ignored = emptyDirectory()
    writeFileSync(join(ignored, '.gitignore'), '.genoacms/\nnode_modules\n')
    await prepareConfig(ignored, initTemplateValues(null, null))
    assert.equal(readFileSync(join(ignored, '.gitignore'), 'utf-8'), '.genoacms/\nnode_modules\n')
  })
})
