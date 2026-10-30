import { test, describe, beforeAll, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPOSITORY = fileURLToPath(new URL('../../..', import.meta.url))
const PACKAGES = join(REPOSITORY, 'packages')
const INSTALLED = ['@genoacms/cli', '@genoacms/core', '@genoacms/config', '@genoacms/adapter-node', '@genoacms/adapter-gcp', '@genoacms/authentication-adapter-array']
const TEST_TOOLING = ['@vitest+browser-playwright@', '@playwright+test@']
const MINUTE = 60000

const CONFIG = `import {
  defineConfig, storageProvider, databaseProvider, authenticationProvider, secretsProvider, deploymentTarget, inline
} from '@genoacms/config'

export default defineConfig({
  authentication: {
    cookieName: '__session',
    providers: { array: authenticationProvider('@genoacms/authentication-adapter-array', { credentials: inline([]) }) }
  },
  secrets: { providers: { 'secret-manager': secretsProvider('@genoacms/adapter-gcp/secrets', { projectId: 'consumer' }) } },
  storage: {
    providers: { gcs: storageProvider('@genoacms/adapter-gcp/storage', { projectId: 'consumer' }) },
    buckets: { cms: { provider: 'gcs' } },
    defaultBucket: 'cms'
  },
  database: {
    providers: { firestore: databaseProvider('@genoacms/adapter-gcp/database', { projectId: 'consumer', databaseId: '(default)' }) },
    databases: { main: { provider: 'firestore', collections: [] } }
  },
  languages: {},
  deployment: {
    targets: {
      node: deploymentTarget('@genoacms/adapter-node', {}),
      gcp: deploymentTarget('@genoacms/adapter-gcp/deployment', { projectId: 'consumer', region: 'europe-west1', functionName: 'cms', credentials: inline({}) })
    }
  },
  authorization: {},
  security: {}
})
`

const readManifest = (dir) => JSON.parse(readFileSync(join(dir, 'package.json'), 'utf-8'))

function workspacePackages () {
  return new Map(readdirSync(PACKAGES)
    .map(name => join(PACKAGES, name))
    .filter(dir => existsSync(join(dir, 'package.json')))
    .map(dir => [readManifest(dir).name, dir]))
}

function workspaceDependencies (manifest) {
  return Object.entries({ ...manifest.dependencies, ...manifest.peerDependencies })
    .filter(([, range]) => range.startsWith('workspace:'))
    .map(([name]) => name)
}

function reachableFrom (roots, workspace) {
  const reached = new Set()
  const visit = (name) => {
    if (reached.has(name)) return
    reached.add(name)
    workspaceDependencies(readManifest(workspace.get(name))).forEach(visit)
  }
  roots.forEach(visit)
  return [...reached]
}

function pack (dir, destination) {
  const before = new Set(readdirSync(destination))
  const packed = spawnSync('pnpm', ['pack', '--pack-destination', destination], { cwd: dir, encoding: 'utf-8', timeout: 2 * MINUTE })
  assert.equal(packed.status, 0, packed.stderr)
  return join(destination, readdirSync(destination).find(name => !before.has(name)))
}

function packAll (destination) {
  const workspace = workspacePackages()
  return Object.fromEntries(reachableFrom(INSTALLED, workspace)
    .map(name => [name, `file:${pack(workspace.get(name), destination)}`]))
}

function writeProject (cwd, tarballs) {
  const { packageManager } = readManifest(REPOSITORY)
  const manifest = { name: 'consumer', private: true, type: 'module', packageManager, dependencies: tarballs, pnpm: { overrides: tarballs } }
  writeFileSync(join(cwd, 'package.json'), JSON.stringify(manifest, null, 2))
  mkdirSync(join(cwd, 'genoa.config'))
  writeFileSync(join(cwd, 'genoa.config/production.ts'), CONFIG)
}

function install (cwd) {
  const installed = spawnSync('pnpm', ['install', '--prod'], { cwd, encoding: 'utf-8', timeout: 8 * MINUTE })
  assert.equal(installed.status, 0, installed.stderr || installed.stdout)
}

function genoa (cwd, ...args) {
  return spawnSync(join(cwd, 'node_modules/.bin/genoa'), args, { cwd, encoding: 'utf-8', timeout: 5 * MINUTE })
}

function assertSucceeded ({ status, stdout, stderr }) {
  assert.equal(status, 0, `${stderr}\n${stdout.slice(-4000)}`)
}

const installedTestTooling = (cwd) => readdirSync(join(cwd, 'node_modules/.pnpm'))
  .filter(entry => TEST_TOOLING.some(prefix => entry.startsWith(prefix)))

describe('a project installing the packed packages', () => {
  const root = mkdtempSync(join(tmpdir(), 'genoacms-published-'))
  const tarballs = join(root, 'tarballs')
  const project = join(root, 'project')

  beforeAll(() => {
    mkdirSync(tarballs)
    mkdirSync(project)
    writeProject(project, packAll(tarballs))
    install(project)
  }, 10 * MINUTE)

  afterAll(() => rmSync(root, { recursive: true, force: true }))

  test.fails('CLI-21: genoa deploy deploys an adapter-node target from the packed packages, installed without devDependencies', () => {
    assertSucceeded(genoa(project, 'deploy', 'node', '--config', 'genoa.config/production.ts'))
    assert.ok(existsSync(join(project, 'build/package.json')))
    assert.deepEqual(installedTestTooling(project), [])
  }, 5 * MINUTE)

  test.fails('CLI-21: genoa build builds an adapter-gcp target from the packed packages', () => {
    assertSucceeded(genoa(project, 'build', 'gcp', '--config', 'genoa.config/production.ts'))
    assert.ok(existsSync(join(project, '.genoacms/build/package.json')))
  }, 5 * MINUTE)
})
