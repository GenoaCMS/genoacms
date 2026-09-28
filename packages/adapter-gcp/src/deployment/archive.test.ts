import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { stageArtifact, zipDirectory, FUNCTION_ENTRY } from './archive.js'

const roots: string[] = []
afterEach(() => { while (roots.length > 0) rmSync(roots.pop() as string, { recursive: true, force: true }) })

function temp (): string {
  const root = mkdtempSync(join(tmpdir(), 'genoa-gcp-archive-'))
  roots.push(root)
  return root
}

function artifact (withPackage = true): string {
  const buildDir = join(temp(), 'build')
  mkdirSync(join(buildDir, 'server'), { recursive: true })
  writeFileSync(join(buildDir, 'index.js'), 'export const handler = () => {}\n')
  writeFileSync(join(buildDir, 'server', 'chunk.js'), '\n')
  if (withPackage) writeFileSync(join(buildDir, 'package.json'), JSON.stringify({ name: 'genoacms-runtime', type: 'module', dependencies: { jose: '5.10.0' } }))
  return buildDir
}

function entryNamesFromCentralDirectory (file: string): string[] {
  const zip = readFileSync(file)
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  const count = zip.readUInt16LE(end + 10)
  let offset = zip.readUInt32LE(end + 16)
  const names: string[] = []
  for (let i = 0; i < count; i++) {
    const nameLength = zip.readUInt16LE(offset + 28)
    names.push(zip.toString('utf-8', offset + 46, offset + 46 + nameLength))
    offset += 46 + nameLength + zip.readUInt16LE(offset + 30) + zip.readUInt16LE(offset + 32)
  }
  return names.filter(name => !name.endsWith('/')).sort()
}

describe('staging the artifact', () => {
  it('DEP-6: adds the function entry and points main at it, keeping the dependencies', async () => {
    const app = await stageArtifact(artifact(), join(temp(), 'app'))
    expect(readFileSync(join(app, 'function.js'), 'utf-8')).toBe(FUNCTION_ENTRY)
    expect(JSON.parse(readFileSync(join(app, 'package.json'), 'utf-8'))).toEqual({
      name: 'genoacms-runtime', type: 'module', dependencies: { jose: '5.10.0' }, main: 'function.js'
    })
  })

  it('DEP-6: refuses an artifact without its runtime package.json', async () => {
    await expect(stageArtifact(artifact(false), join(temp(), 'app'))).rejects.toThrow(/^deploy\/no-runtime-package/)
  })

  it('DEP-7: zips exactly the staged files', async () => {
    const work = temp()
    const app = await stageArtifact(artifact(), join(work, 'app'))
    const archive = await zipDirectory(app, join(work, 'build.zip'))
    expect(entryNamesFromCentralDirectory(archive)).toEqual(['function.js', 'index.js', 'package.json', 'server/chunk.js'])
  })
})
