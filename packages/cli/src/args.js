import { parseArgs } from 'node:util'

const MODES = ['development', 'production']

/** `run` predates `dev` and stays as its alias. */
const normalizeCommand = (command) => command === 'run' ? 'dev' : command

/** @param {string | undefined} mode */
function checkMode (mode) {
  if (mode === undefined || MODES.includes(mode)) return mode
  throw new Error(`cli/invalid-mode: --mode must be development or production, not ${mode}`)
}

/**
 * @param {string[]} argv process.argv.slice(2)
 * @returns {{ command?: string, target?: string, config?: string, mode?: 'development'|'production', noInline: boolean }}
 */
function parseCliArgs (argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    options: { config: { type: 'string' }, mode: { type: 'string' }, 'no-inline': { type: 'boolean', default: false } },
    allowPositionals: true,
    strict: true
  })
  return {
    command: normalizeCommand(positionals[0]),
    target: positionals[1],
    config: values.config,
    mode: checkMode(values.mode),
    noInline: values['no-inline']
  }
}

export { parseCliArgs }
