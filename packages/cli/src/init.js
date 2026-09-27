import { existsSync } from 'node:fs'
import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { exec as execCb } from 'node:child_process'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { intro, log, outro, select, spinner } from '@clack/prompts'

const exec = promisify(execCb)

let packageManager = ''
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/** The files `init` scaffolds into `genoa.config/`, each rendered from the template of that name. */
const TEMPLATE_NAMES = ['development.ts', 'production.ts', 'collections.ts', 'authorization.ts', 'security.ts', 'languages.ts']

const SUITES = {
    gcp: {
        package: '@genoacms/adapter-gcp',
        storage: '@genoacms/adapter-gcp/storage',
        database: '@genoacms/adapter-gcp/database',
        secrets: '@genoacms/adapter-gcp/secrets',
        deployment: '@genoacms/adapter-gcp/deployment',
        target: 'gcp'
    },
    aws: {
        package: '@genoacms/adapter-aws',
        storage: '@genoacms/adapter-aws/storage',
        database: '@genoacms/adapter-aws/database',
        // The AWS suite has no secrets adapter yet.
        secrets: 'TODO: secrets adapter',
        deployment: '@genoacms/adapter-aws/deployment',
        target: 'aws'
    }
}

const NO_SUITE = {
    package: null,
    storage: 'TODO: storage adapter',
    database: 'TODO: database adapter',
    secrets: 'TODO: secrets adapter',
    deployment: 'TODO: deployment adapter',
    target: 'cloud'
}

const AUTHENTICATION_ADAPTERS = {
    array: '@genoacms/authentication-adapter-array'
}

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

/**
 * The placeholder values for a suite and an authentication adapter. What the suite does not provide
 * becomes a `TODO` specifier, which the loader rejects by path until it is replaced.
 */
function initTemplateValues (suite, authentication) {
    const chosen = SUITES[suite] ?? NO_SUITE
    return {
        storage: chosen.storage,
        database: chosen.database,
        secrets: chosen.secrets,
        deployment: chosen.deployment,
        target: chosen.target,
        authentication: AUTHENTICATION_ADAPTERS[authentication] ?? 'TODO: authentication adapter'
    }
}

/** Replaces every `%name%` token that `values` defines. Pure, so each template can be tested. */
function renderTemplate (template, values) {
    return template.replace(/%([a-z]+)%/g, (token, name) => Object.hasOwn(values, name) ? values[name] : token)
}

/** The first file `init` would overwrite, if any: it scaffolds a project, it never edits one. */
function existingConfigFile (cwd) {
    const candidates = [join(cwd, 'genoa.config.ts'), ...TEMPLATE_NAMES.map(name => join(cwd, 'genoa.config', name))]
    return candidates.find(path => existsSync(path))
}

async function writeConfigFiles (cwd, values) {
    const directory = join(cwd, 'genoa.config')
    await mkdir(directory, { recursive: true })
    for (const name of TEMPLATE_NAMES) {
        const template = await readFile(join(__dirname, 'templates', name), 'utf-8')
        await writeFile(join(directory, name), renderTemplate(template, values), 'utf-8')
    }
}

/** `.genoacms/` holds the development secrets store and the build, neither of which belongs in git. */
async function ignoreGenoaDirectory (cwd) {
    const path = join(cwd, '.gitignore')
    const current = existsSync(path) ? await readFile(path, 'utf-8') : ''
    if (current.split('\n').includes('.genoacms/')) return
    const separator = current === '' || current.endsWith('\n') ? '' : '\n'
    await appendFile(path, `${separator}.genoacms/\n`, 'utf-8')
}

async function prepareConfig (cwd, values) {
    const existing = existingConfigFile(cwd)
    if (existing !== undefined) throw new Error(`cli/config-exists: ${existing}`)
    await writeConfigFiles(cwd, values)
    await ignoreGenoaDirectory(cwd)
}

async function installPackages (suite, authentication) {
    // The config files import @genoacms/config and @genoacms/contracts, so both are direct
    // dependencies (strict pnpm). secrets-env and adapter-node back the development config, and
    // language-adapter-ts the required languages stanza.
    const packages = ['@genoacms/core', '@genoacms/config', '@genoacms/contracts', '@genoacms/adapter-secrets-env', '@genoacms/adapter-node', '@genoacms/language-adapter-ts']
    const suitePackage = SUITES[suite]?.package
    if (suitePackage) packages.push(suitePackage)
    const authenticationPackage = AUTHENTICATION_ADAPTERS[authentication]
    if (authenticationPackage) packages.push(authenticationPackage)
    for (const name of packages) await installPackage(name)
}

async function scaffold (suite, authentication) {
    const creating = spinner()
    creating.start('Creating genoa.config/')
    await prepareConfig(process.cwd(), initTemplateValues(suite, authentication))
    creating.stop('genoa.config/ created')
}

function printNextSteps () {
    log.message([
        'Config written to genoa.config/.',
        'Describe the data your project already has in genoa.config/collections.ts, then run:',
        '  genoa dev',
        'Before deploying, fill in genoa.config/production.ts and run:',
        '  genoa deploy --config genoa.config/production.ts'
    ].join('\n'))
}

async function init () {
    intro('Init GenoaCMS')
    const isNpmPackage = existsSync('package.json')
    if (!isNpmPackage) await initNpmProject()
    const suite = await selectAdapterSuite()
    const authentication = await selectAuthenticationAdapter()
    await installPackages(suite, authentication)
    await scaffold(suite, authentication)
    printNextSteps()
    outro('GenoaCMS initialized')
}

export { init, initTemplateValues, renderTemplate, prepareConfig }
