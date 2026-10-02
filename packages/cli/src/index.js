#!/usr/bin/env node

import { isCancel, select } from '@clack/prompts'
import { parseCliArgs } from './args.js'
import { COMMANDS, findCommand } from './commands.js'
import { usage, commandUsage, version } from './help.js'
import { productionConfigHint } from './hint.js'
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

const inTerminal = () => Boolean(process.stdin.isTTY && process.stdout.isTTY)

/** CLI-17 */
function knownCommand (name) {
    const command = findCommand(name)
    if (command === undefined) throw new Error(`cli/unknown-command: ${name}\n${usage()}`)
    return command
}

/** CLI-18, LD3 */
async function commandFromMenu () {
    if (!inTerminal()) throw new Error(`cli/no-command\n${usage()}`)
    const chosen = await selectCommand()
    return chosen === 'exit' || isCancel(chosen) ? undefined : findCommand(chosen)
}

const chooseCommand = async (name) => name === undefined ? await commandFromMenu() : knownCommand(name)

const HINTED_COMMANDS = ['build', 'deploy']

/** CLI-19, LD4 */
function hintFor (command, context, args, error) {
    if (!HINTED_COMMANDS.includes(command.name) || context.mode !== 'production' || args.config !== undefined) return []
    return productionConfigHint({ root: context.root, command: command.name, target: args.target, error }) ?? []
}

async function runInProject (command, run, args) {
    const context = commandContext(command, args)
    try {
        await run(context)
    } catch (error) {
        fail(error, hintFor(command, context, args, error))
    }
}

async function runCommand (command, args) {
    const run = await command.load()
    if (command.name === 'init') return await run()
    await runInProject(command, run, args)
}

/** CLI-14, CLI-15 */
function helpText (name) {
    return findCommand(name) === undefined ? usage() : commandUsage(name)
}

/** A ConfigError's message already lists every issue, so every error prints the same way. */
function fail (error, hint = []) {
    console.error(error.message)
    for (const line of hint) console.error(line)
    process.exit(1)
}

async function main () {
    const args = parseCliArgs(process.argv.slice(2))
    if (args.help) return console.log(helpText(args.command))
    if (args.version) return console.log(version())
    const command = await chooseCommand(args.command)
    if (command !== undefined) await runCommand(command, args)
}

main().catch(fail)
