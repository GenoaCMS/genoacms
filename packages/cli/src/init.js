import { existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { intro, select, spinner } from '@clack/prompts'

let packageManager = ''

async function selectPackageManager () {
    return await select({
        message: 'Select a package manager',
        options: [{
            value: 'npm',
            label: 'npm'
        }, {
            value: 'pnpm',
            label: 'pnpm'
        }, {
            value: 'yarn',
            label: 'yarn'
        }]
    })
}
async function getPackageManager () {
    if (existsSync('package-lock.json')) {
        packageManager = 'npm'
    } else if (existsSync('pnpm-lock.yaml')) {
        packageManager = 'pnpm'
    } else if (existsSync('yarn.lock')) {
        packageManager = 'yarn'
    } else {
        packageManager = selectPackageManager()
    }
}

async function initNpmProject () {
    if (!packageManager) await getPackageManager()
    const initializing = spinner()
    initializing.start('Initializing npm project')
    execSync(`${packageManager} init -y`)
    initializing.stop('npm project initialized')
}

async function installPackage (name) {
    if (!packageManager) await getPackageManager()
    execSync(`${packageManager} install ${name}`)
}

async function init () {
    intro('Init GenoaCMS')
    const isNpmPackage = existsSync('package.json')
    if (!isNpmPackage) await initNpmProject()
    await installPackage('@genoacms/genoacms')

}

export { init }
