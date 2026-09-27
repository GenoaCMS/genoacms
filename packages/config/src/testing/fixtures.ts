import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Throwaway projects for loader tests: a config file and fake packages under node_modules, written
 * to the OS temp directory. Fake packages are plain ESM and never import @genoacms/contracts.
 */

interface FakePackage {
  files: Record<string, string>
  exports: Record<string, string>
  version?: string
}

interface ProjectSpec {
  config: string
  configName?: string
  files?: Record<string, string>
  packages?: Record<string, FakePackage>
  /** Symlinks node_modules/@genoacms/config to this package, so a config can import the helpers. */
  linkConfigPackage?: boolean
}

interface Project { root: string, file: string, cleanup: () => void }

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

function write (root: string, path: string, content: string): void {
  const target = join(root, path)
  mkdirSync(dirname(target), { recursive: true })
  writeFileSync(target, content)
}

function writePackage (root: string, name: string, pkg: FakePackage): void {
  const dir = join('node_modules', name)
  write(root, join(dir, 'package.json'), JSON.stringify({ name, version: pkg.version ?? '1.2.3', type: 'module', exports: pkg.exports }))
  for (const [file, content] of Object.entries(pkg.files)) write(root, join(dir, file), content)
}

function makeProject (spec: ProjectSpec): Project {
  const root = mkdtempSync(join(tmpdir(), 'genoa-config-'))
  const configName = spec.configName ?? 'genoa.config.ts'
  write(root, 'package.json', JSON.stringify({ name: 'fixture-project', private: true, type: 'module' }))
  write(root, configName, spec.config)
  for (const [path, content] of Object.entries(spec.files ?? {})) write(root, path, content)
  for (const [name, pkg] of Object.entries(spec.packages ?? {})) writePackage(root, name, pkg)
  if (spec.linkConfigPackage === true) {
    mkdirSync(join(root, 'node_modules', '@genoacms'), { recursive: true })
    symlinkSync(PACKAGE_ROOT, join(root, 'node_modules', '@genoacms', 'config'), 'dir')
  }
  return { root, file: join(root, configName), cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

/** Every fake runtime: the loader must never import one. */
const THROWING_RUNTIME = "throw new Error('runtime must not be loaded by the loader')\n"

const descriptorModule = (body: string): string => `export default ${body}\n`

const storageDescriptor = descriptorModule(`{
  kind: 'storage',
  runtime: 'fake-storage/runtime',
  secretOptions: { credentials: 'json' },
  validate: (options) => typeof options.projectId === 'string' ? [] : ['projectId is required']
}`)
const databaseDescriptor = descriptorModule("{ kind: 'database', runtime: 'fake-database/runtime' }")
const secretsDescriptor = descriptorModule("{ kind: 'secrets', runtime: 'fake-secrets/runtime', secretOptions: { credentials: 'json' } }")
const devOnlySecretsDescriptor = descriptorModule("{ kind: 'secrets', runtime: 'fake-dev-secrets/runtime', developmentOnly: true }")
const authDescriptor = descriptorModule("{ kind: 'authentication', runtime: 'fake-auth/runtime', secretOptions: { credentials: 'json' } }")
const languageDescriptor = descriptorModule("{ kind: 'language', runtime: 'fake-language/runtime' }")
const deploymentDescriptor = descriptorModule(`{
  kind: 'deployment',
  secretOptions: { credentials: 'json' },
  svelteKitAdapter: async () => ({ default: () => ({ name: 'fake-kit', adapt: () => {} }) }),
  procedure: async () => ({ default: async () => {} })
}`)

const adapterPackage = (descriptor: string, version?: string): FakePackage => ({
  exports: { '.': './descriptor.js', './runtime': './runtime.js' },
  files: { 'descriptor.js': descriptor, 'runtime.js': THROWING_RUNTIME },
  ...(version === undefined ? {} : { version })
})

/** The fake adapters every base config names, plus a development-only secrets store. */
const fakeAdapters = (): Record<string, FakePackage> => ({
  'fake-storage': adapterPackage(storageDescriptor, '4.5.6'),
  'fake-database': adapterPackage(databaseDescriptor),
  'fake-secrets': adapterPackage(secretsDescriptor),
  'fake-dev-secrets': adapterPackage(devOnlySecretsDescriptor),
  'fake-auth': adapterPackage(authDescriptor),
  'fake-language': adapterPackage(languageDescriptor),
  'fake-deployment': adapterPackage(deploymentDescriptor)
})

/** A config that passes every rule in development mode. Tests mutate a copy. */
function baseConfig (): Record<string, any> {
  return {
    authentication: { cookieName: '__session', providers: { array: { adapter: 'fake-auth', options: { credentials: { $inline: [] } } } } },
    database: {
      providers: { db: { adapter: 'fake-database', options: {} } },
      databases: { main: { provider: 'db', collections: [{ name: 'articles', primaryKey: { key: 'id', schema: { type: 'string' } }, schema: { type: 'object' } }] } }
    },
    storage: {
      providers: { gcs: { adapter: 'fake-storage', options: { projectId: 'p', credentials: { $secret: 'GCS_SA' } } } },
      buckets: { genoacms: { provider: 'gcs' } },
      defaultBucket: 'genoacms'
    },
    secrets: { providers: { local: { adapter: 'fake-secrets', options: {} } } },
    languages: { providers: { typescript: { adapter: 'fake-language', options: {} } } },
    deployment: { targets: { local: { adapter: 'fake-deployment', options: {} } } },
    authorization: { roles: { Administrator: [{ permission: '*', resource: '*' }] } },
    security: {}
  }
}

const configSource = (config: unknown): string => `export default ${JSON.stringify(config, null, 2)}\n`

export { makeProject, baseConfig, configSource, fakeAdapters, adapterPackage, THROWING_RUNTIME }
export type { Project, ProjectSpec, FakePackage }
