import { cp, rm, readFile, writeFile, copyFile, access } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'
import archiver from 'archiver'

const execFile = promisify(execFileCallback)
const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'deployment', 'assets')

async function requireRuntimePackage (buildDir) {
  try {
    await access(join(buildDir, 'package.json'))
  } catch {
    throw new Error(`deploy/no-runtime-package: ${buildDir}/package.json is missing; build with genoa build`)
  }
}

/** The artifact's dependencies plus the wrapper's, with the wrapper as the entry. */
async function mergeWrapperPackage (app) {
  const path = join(app, 'package.json')
  const pkg = JSON.parse(await readFile(path, 'utf-8'))
  const wrapper = JSON.parse(await readFile(join(ASSETS, 'package.json'), 'utf-8'))
  const merged = { ...pkg, main: 'index.js', dependencies: { ...pkg.dependencies, ...wrapper.dependencies } }
  await writeFile(path, `${JSON.stringify(merged, null, 2)}\n`)
}

/**
 * Lambda does not install dependencies, so they are installed here, into the staged app. No shell:
 * the old `cd <path> && npm i` interpolated a path into a command line.
 *
 * @param {string} dir
 */
async function installProductionDependencies (dir) {
  await execFile('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], { cwd: dir })
}

/**
 * Stages the build artifact as a Lambda app: adapter-node's server entry is replaced by the
 * aws-serverless-express wrapper, as the old deploy's ignore list did, and dependencies are installed.
 *
 * @param {string} buildDir
 * @param {string} app
 * @param {(dir: string) => Promise<void>} install
 * @returns {Promise<string>}
 */
async function stageLambdaApp (buildDir, app, install) {
  await requireRuntimePackage(buildDir)
  await cp(buildDir, app, { recursive: true })
  await rm(join(app, 'index.js'), { force: true })
  await copyFile(join(ASSETS, 'index.js'), join(app, 'index.js'))
  await mergeWrapperPackage(app)
  await install(app)
  return app
}

/** Zips exactly `dir`: no globbing, no ignore list. */
async function zipDirectory (dir, out) {
  await new Promise((resolve, reject) => {
    const output = createWriteStream(out)
    const archive = archiver('zip', { zlib: { level: 9 } })
    output.on('close', () => { resolve() })
    archive.on('error', (err) => { reject(err) })
    archive.pipe(output)
    archive.directory(dir, false)
    archive.finalize()
  })
  return out
}

export { stageLambdaApp, zipDirectory, installProductionDependencies }
