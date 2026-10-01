import { access, chmod, cp, writeFile } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { join } from 'node:path'
import { execFile as execFileCallback } from 'node:child_process'
import { promisify } from 'node:util'
import archiver from 'archiver'
import { CLIENT_ADDRESS_HEADER } from './settings.js'

const execFile = promisify(execFileCallback)

const ENTRY = 'genoacms-lambda.js'
const RUN_SCRIPT = `#!/bin/sh\nexec node ${ENTRY}\n`

// LMB-15, WD7
const LAMBDA_ENTRY = `import { createServer } from 'node:http'
import { handler } from './handler.js'

const CLIENT_ADDRESS = '${CLIENT_ADDRESS_HEADER}'

function sourceIp (context) {
  try {
    const address = JSON.parse(context).http.sourceIp
    return typeof address === 'string' ? address : undefined
  } catch {
    return undefined
  }
}

function notFound (response) {
  response.statusCode = 404
  response.end()
}

createServer((request, response) => {
  const address = sourceIp(request.headers['x-amzn-request-context'])
  delete request.headers[CLIENT_ADDRESS]
  if (address !== undefined) request.headers[CLIENT_ADDRESS] = address
  handler(request, response, () => { notFound(response) })
}).listen(Number(process.env.PORT))
`
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
  await writeFile(join(app, ENTRY), LAMBDA_ENTRY)
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

export { stageLambdaApp, installProductionDependencies, zipDirectory, NPM_INSTALL, LAMBDA_ENTRY }
