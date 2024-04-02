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
            await deploy()
            break
        }
        case 'database': {
            const database = (await import('./database.js')).default
            await database()
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
