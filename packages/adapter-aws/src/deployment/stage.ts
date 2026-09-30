import { access, chmod, cp, writeFile } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { join } from 'node:path'
import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'
import archiver from 'archiver'

const execFile = promisify(execFileCallback)

const RUN_SCRIPT = '#!/bin/sh\nexec node index.js\n'
const NPM_INSTALL = ['install', '--omit=dev', '--no-audit', '--no-fund', '--os=linux', '--cpu=x64', '--libc=glibc']

async function requireRuntimePackage (buildDir: string): Promise<void> {
  try {
    await access(join(buildDir, 'package.json'))
  } catch {
    throw new Error(`deploy/no-runtime-package: ${buildDir}/package.json is missing; build with genoa build`)
  }
}

// LMB-4
async function stageLambdaApp (buildDir: string, app: string): Promise<string> {
  await requireRuntimePackage(buildDir)
  await cp(buildDir, app, { recursive: true })
  const runScript = join(app, 'run.sh')
  await writeFile(runScript, RUN_SCRIPT)
  await chmod(runScript, 0o755)
  return app
}

// LMB-5
async function installProductionDependencies (dir: string): Promise<void> {
  try {
    await execFile('npm', NPM_INSTALL, { cwd: dir })
  } catch (error) {
    throw new Error(`deploy/install-failed: ${String((error as { stderr?: unknown }).stderr ?? '')}`, { cause: error })
  }
}

// LMB-6
async function zipDirectory (dir: string, out: string): Promise<string> {
  await new Promise<void>((resolve, reject) => {
    const output = createWriteStream(out)
    const archive = archiver('zip', { zlib: { level: 9 } })
    output.on('close', () => { resolve() })
    archive.on('error', reject)
    archive.pipe(output)
    archive.directory(dir, false)
    void archive.finalize()
  })
  return out
}

export { stageLambdaApp, installProductionDependencies, zipDirectory, NPM_INSTALL }
