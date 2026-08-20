#!/usr/bin/env node

import { select } from '@clack/prompts'
import { init } from './init.js'

async function selectMode () {
    return await select({
        message: 'Select a mode',
        options: [{
            value: 'init',
            label: 'Initialize a GenoaCMS project'
        }, {
            value: 'run',
            label: 'Run GenoaCMS locally'
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

async function runMode(mode) {
    switch (mode) {
        case 'init':
            await init()
            break
        case 'run': {
            const run = (await import('./run.js')).default
            run()
            break
        }
        case 'deploy': {
            const deploy = (await import('./deploy.js')).default
            await deploy(args[1])
            break
        }
        case 'database': {
            const database = (await import('./database.js')).default
            await database()
            break
        }
        case 'roles': {
            const roles = (await import('./roles.js')).default
            await roles()
            break
        }
        case 'rotate-root': {
            const rotateRoot = (await import('./rotateRoot.js')).default
            await rotateRoot()
            break
        }
        case 'exit':
            return
        default:
            mode = await selectMode()
            await runMode(mode)
    }

}

const args = process.argv.slice(2)
const mode = args[0]
runMode(mode)
