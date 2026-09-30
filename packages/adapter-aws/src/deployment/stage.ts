import { cp, rm, readFile, writeFile, copyFile, access } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'
import archiver from 'archiver'

const execFile = promisify(execFileCallback)
const ASSETS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'deployment', 'assets')

async function requireRuntimePackage (buildDir: string): Promise<void> {
  try {
    await access(join(buildDir, 'package.json'))
  } catch {
    throw new Error(`deploy/no-runtime-package: ${buildDir}/package.json is missing; build with genoa build`)
  }
}

async function mergeWrapperPackage (app: string): Promise<void> {
  const path = join(app, 'package.json')
  const pkg = JSON.parse(await readFile(path, 'utf-8'))
  const wrapper = JSON.parse(await readFile(join(ASSETS, 'package.json'), 'utf-8'))
  const merged = { ...pkg, main: 'index.js', dependencies: { ...pkg.dependencies, ...wrapper.dependencies } }
  await writeFile(path, `${JSON.stringify(merged, null, 2)}\n`)
}

async function installProductionDependencies (dir: string): Promise<void> {
  await execFile('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], { cwd: dir })
}

async function stageLambdaApp (buildDir: string, app: string, install: (dir: string) => Promise<void>): Promise<string> {
  await requireRuntimePackage(buildDir)
  await cp(buildDir, app, { recursive: true })
  await rm(join(app, 'index.js'), { force: true })
  await copyFile(join(ASSETS, 'index.js'), join(app, 'index.js'))
  await mergeWrapperPackage(app)
  await install(app)
  return app
}

async function zipDirectory (dir: string, out: string): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(out)
    const archive = archiver('zip', { zlib: { level: 9 } })
    output.on('close', () => { resolve() })
    archive.on('error', (err) => { reject(err) })
    archive.pipe(output)
    archive.directory(dir, false)
    void archive.finalize()
  })
  return out
}

export { stageLambdaApp, zipDirectory, installProductionDependencies }
