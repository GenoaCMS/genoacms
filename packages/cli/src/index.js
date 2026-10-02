#!/usr/bin/env node

import { isCancel, select } from '@clack/prompts'
import { parseCliArgs } from './args.js'
import { COMMANDS, findCommand } from './commands.js'
import { usage, commandUsage, version } from './help.js'
import { resolveProject } from './project.js'

async function selectCommand () {
    return await select({
        message: 'Select a command',
        options: [
            ...COMMANDS.map(command => ({ value: command.name, label: command.name, hint: command.summary })),
            { value: 'exit', label: 'Exit' }
        ]
    })
}

/** Everything a command receives. Resolved only once the command is known: `init` needs no project. */
function commandContext (command, args) {
    const project = resolveProject({ cwd: process.cwd(), config: args.config })
    return { ...project, target: args.target, mode: args.mode ?? command.mode, noInline: args.noInline }
}

async function runCommand (name, args) {
    if (name === 'exit' || isCancel(name)) return
    const command = findCommand(name)
    if (command === undefined) return await runCommand(await selectCommand(), args)
    const run = await command.load()
    if (command.name === 'init') return await run()
    await run(commandContext(command, args))
}

/** CLI-14, CLI-15 */
function helpText (name) {
    return findCommand(name) === undefined ? usage() : commandUsage(name)
}

/** A ConfigError's message already lists every issue, so every error prints the same way. */
function fail (error) {
    console.error(error.message)
    process.exit(1)
}

async function main () {
    const args = parseCliArgs(process.argv.slice(2))
    if (args.help) return console.log(helpText(args.command))
    if (args.version) return console.log(version())
    await runCommand(args.command, args)
}

main().catch(fail)
