import { describe, it, expect } from 'vitest'
import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runDatabaseConformance } from '../src/index.js'
import { MUTANTS, FAILING, CONFORMING, fixture, correct } from './mutants/database.js'

runDatabaseConformance(correct(), fixture)

const PARALLEL_CHILDREN = 6

async function childVitest (mutant, report, leftovers) {
  const args = ['exec', 'vitest', 'run', '--config', 'test/mutants/vitest.config.js', 'test/mutants/database.mutant.js', '--reporter=json', `--outputFile=${report}`]
  const env = { ...process.env, GENOACMS_MUTANT: mutant, GENOACMS_MUTANT_LEFTOVERS: leftovers }
  await new Promise(resolve => { execFile('pnpm', args, { env }, () => { resolve() }) })
}

/** Runs the suite against one adapter in a child Vitest; returns the titles of the failed tests and the child's own report of what its store held. */
async function runAgainst (mutant) {
  const directory = await mkdtemp(join(tmpdir(), 'genoacms-mutant-'))
  const report = join(directory, 'report.json')
  const leftovers = join(directory, 'leftovers.json')
  try {
    await childVitest(mutant, report, leftovers)
    const { testResults } = JSON.parse(await readFile(report, 'utf8'))
    const tests = testResults.flatMap(file => file.assertionResults)
    return {
      titles: tests.map(test => test.title).sort(),
      failed: tests.filter(test => test.status === 'failed').map(test => test.title).sort(),
      leftovers: JSON.parse(await readFile(leftovers, 'utf8'))
    }
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}

async function inBatches (items, size, work) {
  const results = []
  for (let start = 0; start < items.length; start += size) {
    results.push(...await Promise.all(items.slice(start, start + size).map(work)))
  }
  return results
}

describe('the database suite', () => {
  it('CONF-3, CONF-6: each assertion fails against its mutant', async () => {
    const outcomes = await inBatches(Object.entries(MUTANTS), PARALLEL_CHILDREN, async ([mutant, { tests }]) =>
      ({ mutant, failed: (await runAgainst(mutant)).failed, expected: [...tests].sort() }))
    expect(outcomes.map(({ mutant, failed }) => ({ mutant, failed })))
      .toEqual(outcomes.map(({ mutant, expected }) => ({ mutant, failed: expected })))
  }, 600_000)

  it('CONF-3: every suite test has a mutant', async () => {
    const mutated = new Set(Object.values(MUTANTS).flatMap(({ tests }) => tests))
    const { titles, failed } = await runAgainst('correct')
    expect(failed).toEqual([])
    expect([...mutated].sort()).toEqual(titles)
  }, 120_000)

  it('CONF-3: the suite cleans up after a failed test', async () => {
    for (const name of Object.keys(FAILING)) {
      const { failed, leftovers } = await runAgainst(name)
      expect(failed.length, name).toBeGreaterThan(0)
      expect({ name, leftovers }).toEqual({ name, leftovers: [] })
    }
  }, 120_000)
})
