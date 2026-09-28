#!/usr/bin/env node
/**
 * Runs the tests of one level and writes a JUnit report per package to reports/<level>/.
 *
 *   node scripts/test-level.mjs unit|integration|conformance|contract
 *
 * docs/README.md, "Test levels", says which tests belong to which level.
 */
import { readdirSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const OPT_IN_CONFORMANCE = 'test/conformance.test.*'
const GCP_ARCHIVE_TESTS = 'src/deployment/archive.test.ts'
const EXCLUDED_FROM_UNIT = new Set(['@genoacms/core', '@genoacms/conformance'])

const runsVitest = (manifest) => /\bvitest\b/.test(manifest.scripts?.test ?? '')

function workspacePackages () {
  return readdirSync('packages')
    .map(dir => join('packages', dir))
    .filter(dir => existsSync(join(dir, 'package.json')))
    .map(dir => ({ dir, manifest: JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8')) }))
}

function unitRuns () {
  return workspacePackages()
    .filter(({ manifest }) => runsVitest(manifest) && !EXCLUDED_FROM_UNIT.has(manifest.name))
    .map(({ dir, manifest }) => ({
      dir,
      args: ['--exclude', OPT_IN_CONFORMANCE, ...(manifest.name === '@genoacms/adapter-gcp' ? ['--exclude', GCP_ARCHIVE_TESTS] : [])]
    }))
}

const RUNS = {
  unit: unitRuns,
  integration: () => [{ dir: 'packages/adapter-gcp', args: [GCP_ARCHIVE_TESTS] }],
  conformance: () => [
    { dir: 'packages/conformance', args: [] },
    { dir: 'packages/adapter-postgres', args: ['test/conformance.test.js'] }
  ],
  contract: () => [
    { dir: 'packages/adapter-gcp', args: ['test/conformance.test.ts'] },
    { dir: 'packages/adapter-aws', args: ['test/conformance.test.js'] }
  ]
}

function reportPath (level, dir) {
  const directory = resolve('reports', level)
  mkdirSync(directory, { recursive: true })
  return join(directory, `${dir.replaceAll('/', '-')}.xml`)
}

function runVitest (level, { dir, args }) {
  const reporterArgs = ['--reporter=default', '--reporter=junit', `--outputFile.junit=${reportPath(level, dir)}`, '--passWithNoTests']
  const result = spawnSync('pnpm', ['exec', 'vitest', 'run', ...args, ...reporterArgs], { cwd: dir, stdio: 'inherit' })
  return result.status === 0
}

function main () {
  const level = process.argv[2]
  if (!(level in RUNS)) {
    console.error(`usage: test-level.mjs ${Object.keys(RUNS).join('|')}`)
    process.exit(2)
  }
  const failed = RUNS[level]().filter(run => !runVitest(level, run)).map(run => run.dir)
  if (failed.length > 0) console.error(`${level}: failed in ${failed.join(', ')}`)
  process.exit(failed.length > 0 ? 1 : 0)
}

main()
