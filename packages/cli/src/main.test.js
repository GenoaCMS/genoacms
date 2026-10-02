import { test, describe, afterAll } from 'vitest'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

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

const FLAG_LINES = {
  config: '-c, --config <file>  The config file, relative to this directory. Default: genoa.config.ts, else genoa.config/development.ts; a production config is always named.',
  mode: '-m, --mode <mode>    development (dev) or production (prod). Default: the command\'s.',
  'no-inline': '    --no-inline      Refuse inline() values in the build.',
  help: '-h, --help           Show this help.'
}

const COMMAND_TABLE = [
  { name: 'init', summary: 'Scaffold a GenoaCMS project in this directory', usage: 'genoa init', flags: [], examples: ['genoa init'] },
  { name: 'dev', summary: 'Run GenoaCMS locally (alias: run)', usage: 'genoa dev [--config <file>] [--mode <mode>]', flags: ['config', 'mode'], mode: 'development', examples: ['genoa dev'] },
  { name: 'build', summary: 'Build GenoaCMS for a deployment target', usage: 'genoa build [target] [--config <file>] [--mode <mode>] [--no-inline]', flags: ['config', 'mode', 'no-inline'], mode: 'production', examples: ['genoa build gcp --config genoa.config/production.ts', 'genoa build --mode development'] },
  { name: 'deploy', summary: 'Build, then deploy to a deployment target', usage: 'genoa deploy [target] [--config <file>] [--mode <mode>] [--no-inline]', flags: ['config', 'mode', 'no-inline'], mode: 'production', examples: ['genoa deploy gcp --config genoa.config/production.ts', 'genoa deploy gcp -c genoa.config/production.ts -m prod'] },
  { name: 'database', summary: 'Delete dynamic collections', usage: 'genoa database [--config <file>] [--mode <mode>]', flags: ['config', 'mode'], mode: 'development', examples: ['genoa database'] },
  { name: 'roles', summary: 'Compose a role or an assignment to paste into the config', usage: 'genoa roles [--config <file>] [--mode <mode>]', flags: ['config', 'mode'], mode: 'development', examples: ['genoa roles'] },
  { name: 'rotate-root', summary: 'Rotate the root trust anchor (asks to confirm)', usage: 'genoa rotate-root [--config <file>] [--mode <mode>]', flags: ['config', 'mode'], mode: 'development', examples: ['genoa rotate-root --config genoa.config/production.ts'] }
]

const commandUsageText = ({ usage, summary, flags, mode, examples }) => [
  `Usage: ${usage}`,
  '',
  `${summary}.`,
  '',
  'Flags:',
  ...[...flags, 'help'].map(flag => `  ${FLAG_LINES[flag]}`),
  '',
  ...(mode === undefined ? [] : [`Default mode: ${mode}`, '']),
  'Examples:',
  ...examples.map(example => `  ${example}`)
].join('\n')

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

function genoaUnder (cwd, nodeOptions, ...args) {
  const { status, stdout, stderr } = spawnSync(process.execPath, [...nodeOptions, CLI, ...args], {
    cwd, input: '', encoding: 'utf-8', timeout: 20000, stdio: 'pipe'
  })
  return { status, stdout, stderr }
}

const COMMAND_MODULES = ['init', 'dev', 'build', 'deploy', 'database', 'roles', 'rotateRoot']
  .map(name => new URL(`./${name}.js`, import.meta.url).href)

const FORBIDDING_HOOKS = `const FORBIDDEN = new Set(${JSON.stringify(COMMAND_MODULES)})
const refuse = (what) => { throw new Error('forbidden import: ' + what) }
export async function resolve (specifier, context, nextResolve) {
  if (specifier === '@genoacms/config/load') refuse(specifier)
  const resolved = await nextResolve(specifier, context)
  if (FORBIDDEN.has(resolved.url)) refuse(resolved.url)
  return resolved
}
export async function load (url, context, nextLoad) {
  if (FORBIDDEN.has(url)) refuse(url)
  return await nextLoad(url, context)
}
`

function forbiddingImports () {
  const hooks = directory({
    'hooks.mjs': FORBIDDING_HOOKS,
    'register.mjs': "import { register } from 'node:module'\nregister('./hooks.mjs', import.meta.url)\n"
  })
  return ['--import', pathToFileURL(join(hooks, 'register.mjs')).href]
}

const hasScript = spawnSync('script', ['--version'], { stdio: 'ignore' }).status === 0

const shellQuote = (word) => `'${word.replaceAll('\'', '\'\\\'\'')}'`

const genoaLine = (...args) => [process.execPath, CLI, ...args].map(shellQuote).join(' ')

const TTY_PROBE = [process.execPath, '-e', 'process.exit(10 + (process.stdin.isTTY ? 1 : 0) + (process.stdout.isTTY ? 2 : 0))'].map(shellQuote).join(' ')

function inTerminal (cwd, commandLine) {
  const { status, stdout } = spawnSync('script', ['-qec', commandLine, '/dev/null'], {
    cwd, input: '', encoding: 'utf-8', timeout: 20000
  })
  return { status, output: stdout }
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

  test('CLI-19: a production build of the default development config names it and the production config', () => {
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

  test.fails('CLI-14: help and version import neither a command nor the config loader', () => {
    const cwd = directory()
    const hooks = forbiddingImports()
    const build = genoaUnder(cwd, hooks, 'build')
    assert.equal(build.status, 1)
    assert.match(build.stderr, /forbidden import/)
    assert.deepEqual(genoaUnder(cwd, hooks, '-h'), { status: 0, stdout: `${USAGE}\n`, stderr: '' })
    assert.deepEqual(genoaUnder(cwd, hooks, 'deploy', '-h'), { status: 0, stdout: `${DEPLOY_USAGE}\n`, stderr: '' })
    assert.deepEqual(genoaUnder(cwd, hooks, '-v'), { status: 0, stdout: `${version}\n`, stderr: '' })
  }, 30000)

  test('CLI-15: prints every command\'s usage as the table gives it', () => {
    const cwd = directory()
    assert.equal(commandUsageText(COMMAND_TABLE.find(command => command.name === 'deploy')), DEPLOY_USAGE)
    for (const command of COMMAND_TABLE) {
      assert.deepEqual(genoa(cwd, command.name, '--help'), { status: 0, stdout: `${commandUsageText(command)}\n`, stderr: '' }, command.name)
    }
    assert.deepEqual(readdirSync(cwd), [])
  }, 30000)

  test('CLI-16: prints the version of the CLI\'s package.json', () => {
    const cwd = directory()
    const fromFile = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8')).version
    const printed = genoa(cwd, '--version')
    assert.equal(printed.status, 0)
    assert.match(printed.stdout, /^\d+\.\d+\.\d+/)
    assert.equal(printed.stdout, `${fromFile}\n`)
  }, 30000)

  test.skipIf(!hasScript)('CLI-17: fails on an unknown command in a terminal', () => {
    const cwd = directory()
    assert.equal(inTerminal(cwd, TTY_PROBE).status, 13)
    const { status, output } = inTerminal(cwd, genoaLine('deplyo'))
    assert.equal(status, 1)
    assert.match(output, /cli\/unknown-command: deplyo/)
  }, 30000)

  test.skipIf(!hasScript)('CLI-18: opens the menu only when both standard input and output are terminals', () => {
    const cwd = directory()
    assert.equal(inTerminal(cwd, `${TTY_PROBE} > probe.txt`).status, 11)
    assert.equal(inTerminal(cwd, `${TTY_PROBE} < /dev/null`).status, 12)

    const piped = inTerminal(cwd, `${genoaLine()} > stdout.txt`)
    assert.equal(piped.status, 1)
    assert.match(piped.output, /cli\/no-command/)
    assert.equal(readFileSync(join(cwd, 'stdout.txt'), 'utf-8'), '')

    const noInput = inTerminal(cwd, `${genoaLine()} < /dev/null`)
    assert.equal(noInput.status, 1)
    assert.match(noInput.output, /cli\/no-command/)
  }, 30000)

  test.fails('CLI-19: names the command and target of a refused deploy, with nothing on standard output but its progress', () => {
    const cwd = developmentOnlyProject()
    const { status, stdout, stderr } = genoa(cwd, 'deploy', 'local')
    assert.equal(status, 1)
    assert.equal(stderr, [
      'config/invalid:',
      '  - secrets.providers.local.adapter: dev-only-adapter is for development only; a production build cannot use it',
      'The config loaded was genoa.config/development.ts, found by default; a production config is named explicitly.',
      'Run: genoa deploy local --config genoa.config/production.ts',
      ''
    ].join('\n'))
    assert.doesNotMatch(stdout, /Canceled/)
  }, 30000)

  test('CLI-19: gives no hint with --config, or for a command other than build and deploy', () => {
    const cwd = developmentOnlyProject()
    for (const args of [['build', '--config', 'genoa.config/development.ts'], ['database', '-m', 'prod']]) {
      const { status, stderr } = genoa(cwd, ...args)
      assert.equal(status, 1, args.join(' '))
      assert.match(stderr, /dev-only-adapter is for development only/, args.join(' '))
      assert.doesNotMatch(stderr, /The config loaded was|Run: genoa/, args.join(' '))
    }
  }, 30000)
})
