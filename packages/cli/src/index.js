#!/usr/bin/env node

import { select } from '@clack/prompts'
import { init } from './init.js'
import run from './run.js'

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
        case 'run':
            run()
            break
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
