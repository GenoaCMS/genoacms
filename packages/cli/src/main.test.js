import { test, describe, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const CLI = fileURLToPath(new URL('./index.js', import.meta.url))
const { version } = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8'))

const USAGE = `Usage: genoa <command> [target] [flags]

Commands:
  init           Scaffold a GenoaCMS project in this directory
  dev            Run GenoaCMS locally (alias: run)
  build          Build GenoaCMS for a deployment target
  deploy         Build, then deploy to a deployment target
  database       Delete dynamic collections
  roles          Compose a role or an assignment to paste into the config
  rotate-root    Rotate the root trust anchor (asks to confirm)

Flags:
  -c, --config <file>  The config file, relative to this directory. Default: genoa.config.ts, else genoa.config/development.ts; a production config is always named.
  -m, --mode <mode>    development (dev) or production (prod). Default: the command's.
      --no-inline      Refuse inline() values in the build.
  -h, --help           Show this help.
  -v, --version        Show the CLI's version.

Run genoa <command> --help for a command's usage.`

const DEPLOY_USAGE = `Usage: genoa deploy [target] [--config <file>] [--mode <mode>] [--no-inline]

Build, then deploy to a deployment target.

Flags:
  -c, --config <file>  The config file, relative to this directory. Default: genoa.config.ts, else genoa.config/development.ts; a production config is always named.
  -m, --mode <mode>    development (dev) or production (prod). Default: the command's.
      --no-inline      Refuse inline() values in the build.
  -h, --help           Show this help.

Default mode: production

Examples:
  genoa deploy gcp --config genoa.config/production.ts
  genoa deploy gcp -c genoa.config/production.ts -m prod`

const roots = []
afterAll(() => { for (const root of roots) rmSync(root, { recursive: true, force: true }) })

function directory (files = {}) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'genoa-cli-main-')))
  roots.push(root)
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true })
    writeFileSync(join(root, path), content)
  }
  return root
}

function genoa (cwd, ...args) {
  const { status, stdout, stderr } = spawnSync(process.execPath, [CLI, ...args], {
    cwd, input: '', encoding: 'utf-8', timeout: 20000, stdio: 'pipe'
  })
  return { status, stdout, stderr }
}

const fakePackage = (name, descriptor) => ({
  [`node_modules/${name}/package.json`]: JSON.stringify({ name, version: '1.0.0', type: 'module', exports: { '.': './index.js', './runtime': './runtime.js' } }),
  [`node_modules/${name}/index.js`]: `export default ${descriptor}\n`,
  [`node_modules/${name}/runtime.js`]: "throw new Error('the loader must not load a runtime')\n"
})

const DEVELOPMENT_CONFIG = `const config: Record<string, unknown> = {
  authentication: { cookieName: '__session', providers: { admins: { adapter: 'fake-authentication', options: { credentials: { $secret: 'GENOACMS_ADMIN_CREDENTIALS' } } } } },
  database: {
    providers: { local: { adapter: 'fake-database', options: {} } },
    databases: { main: { provider: 'local', collections: [] } }
  },
  storage: {
    providers: { local: { adapter: 'fake-storage', options: {} } },
    buckets: { media: { provider: 'local' } },
    defaultBucket: 'media'
  },
  secrets: { providers: { local: { adapter: 'dev-only-adapter', options: {} } } },
  languages: { providers: { typescript: { adapter: 'fake-language', options: {} } } },
  deployment: { targets: { local: { adapter: 'fake-deployment', options: {} } } },
  authorization: { roles: {} },
  security: {}
}

export default config
`

function developmentOnlyProject () {
  return directory({
    'package.json': JSON.stringify({ name: '@genoacms/core', type: 'module' }),
    'genoa.config/development.ts': DEVELOPMENT_CONFIG,
    'genoa.config/production.ts': '',
    ...fakePackage('dev-only-adapter', "{ kind: 'secrets', runtime: 'dev-only-adapter/runtime', developmentOnly: true }"),
    ...fakePackage('fake-authentication', "{ kind: 'authentication', runtime: 'fake-authentication/runtime', secretOptions: { credentials: 'json' } }"),
    ...fakePackage('fake-database', "{ kind: 'database', runtime: 'fake-database/runtime' }"),
    ...fakePackage('fake-storage', "{ kind: 'storage', runtime: 'fake-storage/runtime' }"),
    ...fakePackage('fake-language', "{ kind: 'language', runtime: 'fake-language/runtime' }"),
    ...fakePackage('fake-deployment', `{
  kind: 'deployment',
  svelteKitAdapter: async () => ({ default: () => ({ name: 'fake', adapt () {} }) }),
  procedure: async () => ({ default: async () => {} })
}`)
  })
}

describe('genoa', () => {
  test('CLI-14: prints the usage with -h and --help, and exits 0, outside any project', () => {
    for (const flag of ['-h', '--help']) {
      const cwd = directory()
      assert.deepEqual(genoa(cwd, flag), { status: 0, stdout: `${USAGE}\n`, stderr: '' }, flag)
      assert.deepEqual(readdirSync(cwd), [])
    }
  }, 30000)

  test('CLI-15: prints a command\'s usage, with run as dev, without running it', () => {
    const cwd = directory()
    assert.deepEqual(genoa(cwd, 'deploy', '--help'), { status: 0, stdout: `${DEPLOY_USAGE}\n`, stderr: '' })
    assert.deepEqual(genoa(cwd, '--help', 'deploy'), { status: 0, stdout: `${DEPLOY_USAGE}\n`, stderr: '' })
    const dev = genoa(cwd, 'dev', '-h')
    assert.equal(dev.status, 0)
    assert.match(dev.stdout, /^Usage: genoa dev \[--config <file>\] \[--mode <mode>\]\n/)
    assert.match(dev.stdout, /\nDefault mode: development\n/)
    assert.deepEqual(genoa(cwd, 'run', '-h'), dev)
    const build = genoa(cwd, 'build', '--help')
    assert.equal(build.status, 0)
    assert.match(build.stdout, /\n {2}genoa build gcp --config genoa\.config\/production\.ts\n/)
    assert.deepEqual(genoa(cwd, 'unknown', '--help'), { status: 0, stdout: `${USAGE}\n`, stderr: '' })
    assert.deepEqual(readdirSync(cwd), [])
  }, 30000)

  test('CLI-16: prints the version alone, and help wins over it', () => {
    const cwd = directory()
    assert.deepEqual(genoa(cwd, '-v'), { status: 0, stdout: `${version}\n`, stderr: '' })
    assert.deepEqual(genoa(cwd, '--version'), { status: 0, stdout: `${version}\n`, stderr: '' })
    assert.deepEqual(genoa(cwd, '--version', '--help'), { status: 0, stdout: `${USAGE}\n`, stderr: '' })
    assert.deepEqual(genoa(cwd, '-v', 'deploy', '-h'), { status: 0, stdout: `${DEPLOY_USAGE}\n`, stderr: '' })
  }, 30000)

  test('CLI-17: fails on an unknown command with the usage on standard error', () => {
    const cwd = directory()
    assert.deepEqual(genoa(cwd, 'deplyo'), { status: 1, stdout: '', stderr: `cli/unknown-command: deplyo\n${USAGE}\n` })
  }, 30000)

  test('CLI-18: fails without a command when not in a terminal', () => {
    const cwd = directory()
    assert.deepEqual(genoa(cwd), { status: 1, stdout: '', stderr: `cli/no-command\n${USAGE}\n` })
  }, 30000)

  test('CLI-4: prints a command\'s error alone and exits 1', () => {
    const cwd = directory({ 'package.json': JSON.stringify({ name: 'site' }) })
    assert.deepEqual(genoa(cwd, 'build'), { status: 1, stdout: '', stderr: `cli/core-not-installed: install @genoacms/core in ${cwd}\n` })
  }, 30000)

  test.fails('CLI-19: a production build of the default development config names it and the production config', () => {
    const cwd = developmentOnlyProject()
    assert.deepEqual(genoa(cwd, 'build'), {
      status: 1,
      stdout: '',
      stderr: [
        'config/invalid:',
        '  - secrets.providers.local.adapter: dev-only-adapter is for development only; a production build cannot use it',
        'The config loaded was genoa.config/development.ts, found by default; a production config is named explicitly.',
        'Run: genoa build --config genoa.config/production.ts',
        ''
      ].join('\n')
    })
  }, 30000)
})
