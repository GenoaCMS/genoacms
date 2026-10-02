import { readFileSync } from 'node:fs'
import { COMMANDS, FLAGS, findCommand } from './commands.js'

const indent = (lines) => lines.map(line => `  ${line}`)

const NAME_WIDTH = 15

function usage () {
  return [
    'Usage: genoa <command> [target] [flags]',
    '',
    'Commands:',
    ...indent(COMMANDS.map(command => `${command.name.padEnd(NAME_WIDTH)}${command.summary}`)),
    '',
    'Flags:',
    ...indent(Object.values(FLAGS)),
    '',
    'Run genoa <command> --help for a command\'s usage.'
  ].join('\n')
}

const defaultModeLines = (command) => command.mode === undefined ? [] : [`Default mode: ${command.mode}`, '']

/** @param {string} name a command of `COMMANDS` */
function commandUsage (name) {
  const command = findCommand(name)
  return [
    `Usage: ${command.usage}`,
    '',
    `${command.summary}.`,
    '',
    'Flags:',
    ...indent([...command.flags, 'help'].map(flag => FLAGS[flag])),
    '',
    ...defaultModeLines(command),
    'Examples:',
    ...indent(command.examples)
  ].join('\n')
}

function version () {
  return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf-8')).version
}

export { usage, commandUsage, version }
