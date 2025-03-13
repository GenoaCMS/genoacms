import { existsSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { exec as execCb } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { intro, outro, select, spinner } from '@clack/prompts'

const exec = promisify(execCb)

const isDev = process.argv.includes('--dev')
process.env.DEV = isDev ? 'true' : 'false'
let packageManager = ''
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

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
        packageManager = await selectPackageManager()
    }
}

async function initNpmProject () {
    if (!packageManager) await getPackageManager()
    const initializing = spinner()
    initializing.start('Initializing npm project')
    await exec(`${packageManager} init -y`)
    initializing.stop('npm project initialized')
}

async function installPackage (name) {
    if (!packageManager) await getPackageManager()
    const installing = spinner()
    installing.start(`Installing ${name}`)
    await exec(`${packageManager} install ${name}`)
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

async function prepareConfig (adapterSuite, authenticationAdapter) {
    const creating = spinner()
    creating.start('Creating genoa.config.js')
    const templateConfigPath = join(__dirname, 'genoa.config.js')
    const config = await readFile(templateConfigPath, 'utf-8')
    const adapterSuitePackage = adapterSuiteToPackageName(adapterSuite)
    const authenticationAdapterPackage = authenticationAdapterToPackageName(authenticationAdapter)
    const preparedConfig = config.replace('%authentication-adapter%', authenticationAdapterPackage)
        .replace('%authorization-adapter%', adapterSuitePackage + '/authorization')
        .replace('%database-adapter%', adapterSuitePackage + '/database')
        .replace('%storage-adapter%', adapterSuitePackage + '/storage')
    const workDir = process.cwd()
    const configPath = join(workDir, 'genoa.config.js')
    await writeFile(configPath, preparedConfig, 'utf-8')
    creating.stop('genoa.config.js created')
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
    await prepareConfig(adapterSuite, authenticationAdapter)
    outro('GenoaCMS initialized')
}

export { init }
