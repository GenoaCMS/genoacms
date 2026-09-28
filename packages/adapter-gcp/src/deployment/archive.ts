import { cp, readFile, writeFile, access } from 'node:fs/promises'
import { createWriteStream } from 'node:fs'
import { join } from 'node:path'
import archiver from 'archiver'

// DEP-6, DEP-10
const FUNCTION_ENTRY = `import { handler } from './index.js'

/** Cloud Run functions entry point. The name must match buildConfig.entryPoint. */
export function genoacms (req, res) {
  handler(req, res, undefined)
}
`

async function requireRuntimePackage (buildDir: string): Promise<void> {
  try {
    await access(join(buildDir, 'package.json'))
  } catch {
    throw new Error(`deploy/no-runtime-package: ${buildDir}/package.json is missing; build with genoa build`)
  }
}

async function setMain (packageJsonPath: string, main: string): Promise<void> {
  const pkg = JSON.parse(await readFile(packageJsonPath, 'utf-8'))
  await writeFile(packageJsonPath, `${JSON.stringify({ ...pkg, main }, null, 2)}\n`)
}

// DEP-6
async function stageArtifact (buildDir: string, app: string): Promise<string> {
  await requireRuntimePackage(buildDir)
  await cp(buildDir, app, { recursive: true })
  await setMain(join(app, 'package.json'), 'function.js')
  await writeFile(join(app, 'function.js'), FUNCTION_ENTRY)
  return app
}

// DEP-7
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

export { stageArtifact, zipDirectory, FUNCTION_ENTRY }
