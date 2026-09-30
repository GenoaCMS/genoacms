import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { stageLambdaApp, installProductionDependencies, zipDirectory } from './stage.js'

const RUN_SH = '#!/bin/sh\nexec node index.js\n'
const BUILD_FILES: Record<string, string> = {
  'package.json': JSON.stringify({ name: 'genoacms-runtime', type: 'module' }),
  'index.js': 'console.log("server")\n',
  'client/a.js': 'export const a = 1\n'
}

const roots: string[] = []
afterEach(() => { while (roots.length > 0) rmSync(roots.pop() as string, { recursive: true, force: true }) })

function temporaryRoot (): string {
  const root = mkdtempSync(join(tmpdir(), 'genoa-aws-stage-'))
  roots.push(root)
  return root
}

function buildDirectory (files: Record<string, string> = BUILD_FILES): { buildDir: string, app: string, root: string } {
  const root = temporaryRoot()
  const buildDir = join(root, 'build')
  for (const [name, content] of Object.entries(files)) {
    mkdirSync(join(buildDir, name, '..'), { recursive: true })
    writeFileSync(join(buildDir, name), content)
  }
  mkdirSync(join(root, 'work'))
  return { buildDir, app: join(root, 'work', 'app'), root }
}

function filesUnder (dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter(entry => entry.isFile())
    .map(entry => relative(dir, join(entry.parentPath, entry.name)))
    .sort()
}

interface ZipEntry { name: string, mode: number }

function zipEntries (archive: Buffer): ZipEntry[] {
  const end = archive.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  const count = archive.readUInt16LE(end + 10)
  let offset = archive.readUInt32LE(end + 16)
  const entries: ZipEntry[] = []
  for (let index = 0; index < count; index++) {
    const nameLength = archive.readUInt16LE(offset + 28)
    const extraLength = archive.readUInt16LE(offset + 30)
    const commentLength = archive.readUInt16LE(offset + 32)
    const externalAttributes = archive.readUInt32LE(offset + 38)
    const name = archive.subarray(offset + 46, offset + 46 + nameLength).toString('utf-8')
    entries.push({ name, mode: (externalAttributes >>> 16) & 0o777 })
    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

describe('staging the Lambda app', () => {
  it.fails('LMB-4: copies the build, adds run.sh, and changes nothing else', async () => {
    const { buildDir, app } = buildDirectory()
    await stageLambdaApp(buildDir, app)
    expect(filesUnder(app)).toEqual([...Object.keys(BUILD_FILES), 'run.sh'].sort())
    for (const name of Object.keys(BUILD_FILES)) {
      expect(readFileSync(join(app, name))).toEqual(readFileSync(join(buildDir, name)))
    }
    expect(readFileSync(join(app, 'run.sh'), 'utf-8')).toBe(RUN_SH)
    expect(statSync(join(app, 'run.sh')).mode & 0o777).toBe(0o755)
  })

  it('LMB-4: refuses a build without package.json', async () => {
    const { buildDir, app } = buildDirectory({ 'index.js': 'console.log("server")\n' })
    await expect(stageLambdaApp(buildDir, app)).rejects.toThrow(
      new Error(`deploy/no-runtime-package: ${buildDir}/package.json is missing; build with genoa build`)
    )
  })

  it.fails("LMB-5: installs for Linux x64 without a shell, and fails with npm's output", async () => {
    const dir = temporaryRoot()
    writeFileSync(join(dir, 'package.json'), '{ this is not json')
    const install = installProductionDependencies(dir)
    await expect(install).rejects.toThrow(/^deploy\/install-failed: /)
    await expect(install).rejects.toThrow(/EJSONPARSE/)
  }, 120_000)

  it.fails('LMB-6: zips exactly the staged directory, keeping run.sh executable', async () => {
    const { buildDir, app, root } = buildDirectory()
    await stageLambdaApp(buildDir, app)
    const archive = join(root, 'app.zip')
    await zipDirectory(app, archive)
    const files = zipEntries(readFileSync(archive)).filter(entry => !entry.name.endsWith('/'))
    expect(files.map(entry => entry.name).sort()).toEqual(filesUnder(app))
    expect(files.find(entry => entry.name === 'run.sh')?.mode).toBe(0o755)
  })
})
