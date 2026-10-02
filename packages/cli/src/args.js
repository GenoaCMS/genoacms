import { parseArgs } from 'node:util'

const MODES = ['development', 'production']
const MODE_ALIASES = { dev: 'development', prod: 'production' }

/** `run` predates `dev` and stays as its alias. */
const normalizeCommand = (command) => command === 'run' ? 'dev' : command

/** @param {string | undefined} mode */
function checkMode (mode) {
  if (mode === undefined || MODES.includes(mode)) return mode
  if (Object.hasOwn(MODE_ALIASES, mode)) return MODE_ALIASES[mode]
  throw new Error(`cli/invalid-mode: --mode must be development (dev) or production (prod), not ${mode}`)
}

/** @param {string | undefined} config */
function checkConfig (config) {
  if (config === '') throw new Error('cli/invalid-config: --config must name a file')
  return config
}

const OPTIONS = {
  config: { type: 'string', short: 'c' },
  mode: { type: 'string', short: 'm' },
  'no-inline': { type: 'boolean', default: false },
  help: { type: 'boolean', short: 'h', default: false },
  version: { type: 'boolean', short: 'v', default: false }
}

/**
 * @param {string[]} argv process.argv.slice(2)
 * @returns {{ command?: string, target?: string, config?: string, mode?: 'development'|'production', noInline: boolean, help: boolean, version: boolean }}
 */
function parseCliArgs (argv) {
  const { values, positionals } = parseArgs({ args: argv, options: OPTIONS, allowPositionals: true, strict: true })
  return {
    command: normalizeCommand(positionals[0]),
    target: positionals[1],
    config: checkConfig(values.config),
    mode: checkMode(values.mode),
    noInline: values['no-inline'],
    help: values.help,
    version: values.version
  }
}

export { parseCliArgs }
