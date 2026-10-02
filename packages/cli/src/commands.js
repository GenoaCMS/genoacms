/** The flags' help lines, aligned for the usage. */
const FLAGS = {
  config: '-c, --config <file>  The config file, relative to this directory. Default: genoa.config.ts, else genoa.config/development.ts; a production config is always named.',
  mode: '-m, --mode <mode>    development (dev) or production (prod). Default: the command\'s.',
  'no-inline': '    --no-inline      Refuse inline() values in the build.',
  help: '-h, --help           Show this help.',
  version: '-v, --version        Show the CLI\'s version.'
}

/** Every command, in the menu's order, with its default `mode` (LD1, CLI-2). */
const COMMANDS = [
  {
    name: 'init',
    summary: 'Scaffold a GenoaCMS project in this directory',
    usage: 'genoa init',
    flags: [],
    examples: ['genoa init'],
    load: async () => (await import('./init.js')).init
  },
  {
    name: 'dev',
    summary: 'Run GenoaCMS locally (alias: run)',
    usage: 'genoa dev [--config <file>] [--mode <mode>]',
    flags: ['config', 'mode'],
    mode: 'development',
    examples: ['genoa dev'],
    load: async () => (await import('./dev.js')).default
  },
  {
    name: 'build',
    summary: 'Build GenoaCMS for a deployment target',
    usage: 'genoa build [target] [--config <file>] [--mode <mode>] [--no-inline]',
    flags: ['config', 'mode', 'no-inline'],
    mode: 'production',
    examples: ['genoa build gcp --config genoa.config/production.ts', 'genoa build --mode development'],
    load: async () => (await import('./build.js')).build
  },
  {
    name: 'deploy',
    summary: 'Build, then deploy to a deployment target',
    usage: 'genoa deploy [target] [--config <file>] [--mode <mode>] [--no-inline]',
    flags: ['config', 'mode', 'no-inline'],
    mode: 'production',
    examples: ['genoa deploy gcp --config genoa.config/production.ts', 'genoa deploy gcp -c genoa.config/production.ts -m prod'],
    load: async () => (await import('./deploy.js')).default
  },
  {
    name: 'database',
    summary: 'Delete dynamic collections',
    usage: 'genoa database [--config <file>] [--mode <mode>]',
    flags: ['config', 'mode'],
    mode: 'development',
    examples: ['genoa database'],
    load: async () => (await import('./database.js')).default
  },
  {
    name: 'roles',
    summary: 'Compose a role or an assignment to paste into the config',
    usage: 'genoa roles [--config <file>] [--mode <mode>]',
    flags: ['config', 'mode'],
    mode: 'development',
    examples: ['genoa roles'],
    load: async () => (await import('./roles.js')).default
  },
  {
    name: 'rotate-root',
    summary: 'Rotate the root trust anchor (asks to confirm)',
    usage: 'genoa rotate-root [--config <file>] [--mode <mode>]',
    flags: ['config', 'mode'],
    mode: 'development',
    examples: ['genoa rotate-root --config genoa.config/production.ts'],
    load: async () => (await import('./rotateRoot.js')).default
  }
]

const findCommand = (name) => COMMANDS.find(command => command.name === name)

export { COMMANDS, FLAGS, findCommand }
