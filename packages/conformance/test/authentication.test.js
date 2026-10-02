import { describe, it, expect } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runAuthenticationConformance } from '../src/index.js'
import { MUTANTS, fixture, correct } from './mutants/authentication.js'

runAuthenticationConformance(correct(), fixture)

/** Runs the suite against one mutant in a child Vitest and returns the titles of the tests that failed. */
function failedTests (mutant) {
  const directory = mkdtempSync(join(tmpdir(), 'genoacms-mutant-'))
  const report = join(directory, 'report.json')
  try {
    spawnSync('pnpm', ['exec', 'vitest', 'run', '--config', 'test/mutants/vitest.config.js', '--reporter=json', `--outputFile=${report}`], {
      env: { ...process.env, GENOACMS_MUTANT: mutant },
      encoding: 'utf8'
    })
    const { testResults } = JSON.parse(readFileSync(report, 'utf8'))
    return testResults.flatMap(file => file.assertionResults).filter(test => test.status === 'failed').map(test => test.title)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
}

describe('the authentication suite', () => {
  it('CONF-4: each assertion fails against its mutant', () => {
    for (const [mutant, { tests }] of Object.entries(MUTANTS)) {
      expect({ mutant, failed: failedTests(mutant).sort() }).toEqual({ mutant, failed: [...tests].sort() })
    }
  }, 300_000)
})
