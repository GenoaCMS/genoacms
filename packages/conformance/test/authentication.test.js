import { describe, it, expect } from 'vitest'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runAuthenticationConformance } from '../src/index.js'
import { MUTANTS, CONFORMING, fixture, correct } from './mutants/authentication.js'

runAuthenticationConformance(correct(), fixture)

/** Runs the suite against one mutant in a child Vitest and returns the titles of the tests that failed. */
async function failedTests (mutant) {
  const directory = await mkdtemp(join(tmpdir(), 'genoacms-mutant-'))
  const report = join(directory, 'report.json')
  try {
    const args = ['exec', 'vitest', 'run', '--config', 'test/mutants/vitest.config.js', 'test/mutants/authentication.mutant.js', '--reporter=json', `--outputFile=${report}`]
    await new Promise(resolve => { execFile('pnpm', args, { env: { ...process.env, GENOACMS_MUTANT: mutant } }, () => { resolve() }) })
    const { testResults } = JSON.parse(await readFile(report, 'utf8'))
    return testResults.flatMap(file => file.assertionResults).filter(test => test.status === 'failed').map(test => test.title)
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

describe('the authentication suite', () => {
  it('CONF-4: each assertion fails against its mutant', async () => {
    for (const [mutant, { tests }] of Object.entries(MUTANTS)) {
      expect({ mutant, failed: (await failedTests(mutant)).sort() }).toEqual({ mutant, failed: [...tests].sort() })
    }
  }, 300_000)

  it('CONF-4: an adapter that only throttles where the statement allows it passes the suite', async () => {
    for (const name of Object.keys(CONFORMING)) {
      expect({ name, failed: await failedTests(name) }).toEqual({ name, failed: [] })
    }
  }, 300_000)
})
