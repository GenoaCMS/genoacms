import { existsSync, readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'
import { intro, outro, select, spinner } from '@clack/prompts'

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
    const installing = spinner()
    installing.start(`Installing ${name}`)
    execSync(`${packageManager} install ${name}`)
    installing.stop(`${name} installed`)
}

async function selectAdapterSuite () {
    return await select({
        message: 'Select an adapter suite',
        options: [{
            value: 'gcp',
            label: 'Google Cloud Platform'
        }, {
            value: 'aws',
            label: 'Amazon Web Services'
        }, {
            value: null,
            label: `None of the above, I'll provide my own adapter`
        }]
    })
}

function adapterSuiteToPackageName (adapter) {
    switch (adapter) {
        case 'gcp':
            return '@genoacms/adapter-gcp'
        case 'aws':
            return '@genoacms/adapter-aws'
    }
    return null
}

async function installAdapterSuite (adapter) {
    const packageName = adapterSuiteToPackageName(adapter)
    if (packageName) await installPackage(packageName)
}

async function selectAuthenticationAdapter () {
    return await select({
        message: 'Select an authentication adapter',
        options: [{
            value: 'array',
            label: 'Array'
        }, {
            value: null,
            label: `None of the above, I'll provide my own adapter`
        }]
    })

}

function authenticationAdapterToPackageName (adapter) {
    switch (adapter) {
        case 'array':
            return '@genoacms/authentication-adapter-array'
    }
    return null
}

async function installAuthenticationAdapter (adapter) {
    const packageName = authenticationAdapterToPackageName(adapter)
    if (packageName) await installPackage(packageName)
}

async function prepareConfig () {
    const config = readFileSync('genoa.config.js', 'utf-8')
    const authenticationAdapterPackage = authenticationAdapterToPackageName()
    const adapterSuitePackage = adapterSuiteToPackageName()
    const preparedConfig = config.replace('%authentication-adapter%', authenticationAdapterPackage)
        .replace('%authorization-adapter%', adapterSuitePackage + '/authorization')
        .replace('%database-adapter%', adapterSuitePackage + '/database')
        .replace('%storage-adapter%', adapterSuitePackage + '/storage')
    const workDir = process.cwd()
    const configPath = join(workDir, 'genoa.config.js')
    writeFileSync(configPath, preparedConfig)
}

async function init () {
    intro('Init GenoaCMS')
    const isNpmPackage = existsSync('package.json')
    if (!isNpmPackage) await initNpmProject()
    await installPackage('@genoacms/core')
    const adapterSuite = await selectAdapterSuite()
    await installAdapterSuite(adapterSuite)
    const authenticationAdapter = await selectAuthenticationAdapter()
    await installAuthenticationAdapter(authenticationAdapter)
    await prepareConfig()
    outro('GenoaCMS initialized')
}

export { init }
