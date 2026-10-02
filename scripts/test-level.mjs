#!/usr/bin/env node
/**
 * Runs the tests of one level and writes a JUnit report per package to reports/<level>/.
 *
 *   node scripts/test-level.mjs unit|integration|conformance|contract|e2e
 *
 * docs/README.md, "Test levels", says which tests belong to which level.
 */
import { readdirSync, readFileSync, existsSync, mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const REAL_SERVICE_TESTS = 'test/**'
const END_TO_END_TESTS = 'e2e/**'
const GCP_ARCHIVE_TESTS = 'src/deployment/archive.test.ts'
const AWS_STAGE_TESTS = 'src/deployment/stage.test.ts'
const CLI_MAIN_TESTS = 'src/main.test.js'
const INTEGRATION_TESTS = { '@genoacms/adapter-gcp': GCP_ARCHIVE_TESTS, '@genoacms/adapter-aws': AWS_STAGE_TESTS, '@genoacms/cli': CLI_MAIN_TESTS }
const EXCLUDED_FROM_UNIT = new Set(['@genoacms/conformance'])
const SVELTEKIT_PACKAGES = { '@genoacms/core': 'genoa.config/test.ts' }

const runsVitest = (manifest) => /\bvitest\b/.test(manifest.scripts?.['test:unit'] ?? manifest.scripts?.test ?? '')

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
      sveltekitConfig: SVELTEKIT_PACKAGES[manifest.name],
      args: ['--exclude', REAL_SERVICE_TESTS, '--exclude', END_TO_END_TESTS, ...(manifest.name in INTEGRATION_TESTS ? ['--exclude', INTEGRATION_TESTS[manifest.name]] : [])]
    }))
}

function endToEndRuns () {
  return workspacePackages()
    .filter(({ dir, manifest }) => runsVitest(manifest) && existsSync(join(dir, 'e2e')))
    .map(({ dir, manifest }) => ({ dir, sveltekitConfig: SVELTEKIT_PACKAGES[manifest.name], args: ['--mode', 'e2e', 'e2e'] }))
}

const RUNS = {
  unit: unitRuns,
  integration: () => [
    { dir: 'packages/adapter-gcp', args: [GCP_ARCHIVE_TESTS] },
    { dir: 'packages/adapter-aws', args: [AWS_STAGE_TESTS] },
    { dir: 'packages/cli', args: [CLI_MAIN_TESTS] }
  ],
  conformance: () => [
    { dir: 'packages/conformance', args: [] },
    { dir: 'packages/adapter-postgres', args: ['test/conformance.test.js'] },
    { dir: 'packages/authentication-adapter-array', args: ['test/conformance.test.js'] }
  ],
  contract: () => [
    { dir: 'packages/adapter-gcp', args: ['test/conformance.test.ts', 'test/contract'] },
    { dir: 'packages/adapter-aws', args: ['test/conformance.test.ts', 'test/contract'] }
  ],
  e2e: endToEndRuns
}

function reportPath (level, dir) {
  const directory = resolve('reports', level)
  mkdirSync(directory, { recursive: true })
  return join(directory, `${dir.replaceAll('/', '-')}.xml`)
}

function syncSvelteKit (dir, config) {
  const environment = { ...process.env, GENOA_MODE: 'development', GENOA_CONFIG: resolve(dir, config) }
  return spawnSync('pnpm', ['exec', 'svelte-kit', 'sync'], { cwd: dir, stdio: 'inherit', env: environment }).status === 0
}

function runVitest (level, { dir, args, sveltekitConfig }) {
  if (sveltekitConfig !== undefined && !syncSvelteKit(dir, sveltekitConfig)) return false
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
