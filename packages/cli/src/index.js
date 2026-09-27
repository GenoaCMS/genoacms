#!/usr/bin/env node

import { isCancel, select } from '@clack/prompts'
import { init } from './init.js'
import { parseCliArgs } from './args.js'
import { resolveProject } from './project.js'

/** `build` and `deploy` default to production; everything that works on a local instance does not. */
const DEFAULT_MODES = {
    dev: 'development',
    build: 'production',
    deploy: 'production',
    database: 'development',
    roles: 'development',
    'rotate-root': 'development'
}

const COMMANDS = {
    dev: async () => (await import('./dev.js')).default,
    build: async () => (await import('./build.js')).build,
    deploy: async () => (await import('./deploy.js')).default,
    database: async () => (await import('./database.js')).default,
    roles: async () => (await import('./roles.js')).default,
    'rotate-root': async () => (await import('./rotateRoot.js')).default
}

async function selectMode () {
    return await select({
        message: 'Select a mode',
        options: [{
            value: 'init',
            label: 'Initialize a GenoaCMS project'
        }, {
            value: 'dev',
            label: 'dev',
            hint: 'run GenoaCMS locally'
        }, {
            value: 'build',
            label: 'build',
            hint: 'build GenoaCMS for a deployment target'
        }, {
            value: 'deploy',
            label: 'Deploy GenoaCMS'
        }, {
            value: 'database',
            label: 'Configure database'
        }, {
            value: 'roles',
            label: 'Compose a role declaration'
        }, {
            value: 'rotate-root',
            label: 'Rotate the root trust anchor'
        }, {
            value: 'exit',
            label: 'Exit'
        }]
    })
}

/** Everything a command receives. Resolved only once the command is known: `init` needs no project. */
function commandContext (command, args) {
    const project = resolveProject({ cwd: process.cwd(), config: args.config })
    return { ...project, target: args.target, mode: args.mode ?? DEFAULT_MODES[command], noInline: args.noInline }
}

async function runMode (command, args) {
    if (command === 'init') return await init()
    if (command === 'exit' || isCancel(command)) return
    const load = COMMANDS[command]
    if (load === undefined) return await runMode(await selectMode(), args)
    const run = await load()
    await run(commandContext(command, args))
}

/** A ConfigError's message already lists every issue, so every error prints the same way. */
function fail (error) {
    console.error(error.message)
    process.exit(1)
}

async function main () {
    const args = parseCliArgs(process.argv.slice(2))
    await runMode(args.command, args)
}

main().catch(fail)
