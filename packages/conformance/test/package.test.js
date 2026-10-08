import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as conformance from '@genoacms/conformance'

const SUITES = ['storage conformance', 'database conformance', 'authentication conformance']

function registeredTests () {
  const directory = mkdtempSync(join(tmpdir(), 'genoacms-registration-'))
  const report = join(directory, 'report.json')
  try {
    spawnSync('pnpm', ['exec', 'vitest', 'run', '--config', 'test/registration/vitest.config.js', '--reporter=json', `--outputFile=${report}`], { encoding: 'utf8' })
    const { testResults } = JSON.parse(readFileSync(report, 'utf8'))
    return testResults.flatMap(file => file.assertionResults)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

const suitesUnder = (tests, ancestors) => SUITES.filter(suite =>
  tests.some(test => JSON.stringify(test.ancestorTitles) === JSON.stringify([...ancestors, suite])))

describe('the package', () => {
  it('CONF-1: exports one function per suite', () => {
    expect(Object.keys(conformance).sort()).toEqual(['runAuthenticationConformance', 'runDatabaseConformance', 'runStorageConformance'])
    for (const run of Object.values(conformance)) expect(run).toBeTypeOf('function')
  })

  it('CONF-1: each function registers its suite when called, at the top level and inside a describe', () => {
    const tests = registeredTests()
    expect(suitesUnder(tests, [])).toEqual(SUITES)
    expect(suitesUnder(tests, ['inside a describe'])).toEqual(SUITES)
  }, 300_000)

  it('CONF-1: vitest is a peer dependency, ^3.0.0', () => {
    const manifest = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
    expect(manifest.peerDependencies.vitest).toBe('^3.0.0')
  })
})
