import { describe, it, expect, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { deflateRawSync } from 'node:zlib'
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer, connect, type AddressInfo } from 'node:net'
import { request as httpRequest, type OutgoingHttpHeaders } from 'node:http'
import { stageLambdaApp, installProductionDependencies, zipDirectory } from './stage.js'

const RUN_SH = '#!/bin/sh\nexec node genoacms-lambda.js\n'
const ENTRY = 'genoacms-lambda.js'
const ENTRY_START_MS = 10_000
const ECHO_HANDLER = `export function handler (request, response) {
  response.writeHead(200, { 'content-type': 'application/json' })
  response.end(JSON.stringify(request.headers))
}
`
const PASSING_HANDLER = 'export function handler (request, response, next) { next() }\n'
const CLIENT_ADDRESS = 'x-genoacms-client-address'
const FORGED_CLIENT = '203.0.113.9'
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

async function freePort (): Promise<number> {
  const server = createServer()
  await new Promise<void>(resolve => server.listen(0, resolve))
  const { port } = server.address() as AddressInfo
  await new Promise(resolve => server.close(resolve))
  return port
}

async function accepts (port: number): Promise<boolean> {
  return await new Promise(resolve => {
    const socket = connect(port, '127.0.0.1')
    socket.once('connect', () => { socket.destroy(); resolve(true) })
    socket.once('error', () => { socket.destroy(); resolve(false) })
  })
}

interface RunningEntry { child: ChildProcess, origin: string }

async function startEntry (app: string): Promise<RunningEntry> {
  const port = await freePort()
  const child = spawn(process.execPath, [ENTRY], { cwd: app, env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'ignore', 'pipe'] })
  let stderr = ''
  child.stderr?.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
  const running = { child, origin: `http://127.0.0.1:${port}` }
  const deadline = Date.now() + ENTRY_START_MS
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`the entry exited with ${child.exitCode}: ${stderr}`)
    if (await accepts(port)) return running
    await new Promise(resolve => setTimeout(resolve, 50))
  }
  stopEntry(running)
  throw new Error(`the entry did not accept connections within ${ENTRY_START_MS} ms: ${stderr}`)
}

function stopEntry ({ child }: RunningEntry): void {
  if (child.exitCode === null) child.kill('SIGKILL')
}

async function stagedWithHandler (handler: string): Promise<string> {
  const { buildDir, app } = buildDirectory({ 'package.json': JSON.stringify({ type: 'module' }), 'handler.js': handler })
  await stageLambdaApp(buildDir, app)
  return app
}

async function receivedHeaders (origin: string, headers: OutgoingHttpHeaders): Promise<Record<string, string>> {
  return await new Promise((resolve, reject) => {
    const sent = httpRequest(origin, { headers }, (response) => {
      const chunks: Buffer[] = []
      response.on('data', (chunk: Buffer) => chunks.push(chunk))
      response.on('end', () => {
        expect(response.statusCode).toBe(200)
        resolve(JSON.parse(Buffer.concat(chunks).toString()) as Record<string, string>)
      })
    })
    sent.on('error', reject)
    sent.end()
  })
}

interface ZipEntry { name: string, mode: number, method: number, data: Buffer }

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
    const method = archive.readUInt16LE(offset + 10)
    const compressedSize = archive.readUInt32LE(offset + 20)
    const localOffset = archive.readUInt32LE(offset + 42)
    const dataStart = localOffset + 30 + archive.readUInt16LE(localOffset + 26) + archive.readUInt16LE(localOffset + 28)
    const name = archive.subarray(offset + 46, offset + 46 + nameLength).toString('utf-8')
    entries.push({ name, mode: (externalAttributes >>> 16) & 0o777, method, data: archive.subarray(dataStart, dataStart + compressedSize) })
    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}

describe('staging the Lambda app', () => {
  it('LMB-4: copies the build, adds run.sh and the entry, and changes nothing else', async () => {
    const { buildDir, app } = buildDirectory()
    await stageLambdaApp(buildDir, app)
    expect(filesUnder(app)).toEqual([...Object.keys(BUILD_FILES), ENTRY, 'run.sh'].sort())
    for (const name of Object.keys(BUILD_FILES)) {
      expect(readFileSync(join(app, name))).toEqual(readFileSync(join(buildDir, name)))
    }
    expect(readFileSync(join(app, 'run.sh'), 'utf-8')).toBe(RUN_SH)
    expect(statSync(join(app, 'run.sh')).mode & 0o777).toBe(0o755)
    expect(statSync(join(app, ENTRY)).isFile()).toBe(true)
  })

  it('LMB-4: replaces a genoacms-lambda.js of the build', async () => {
    const plain = buildDirectory()
    await stageLambdaApp(plain.buildDir, plain.app)
    const entry = readFileSync(join(plain.app, ENTRY), 'utf-8')

    const other = 'console.log("not the entry")\n'
    const { buildDir, app } = buildDirectory({ ...BUILD_FILES, [ENTRY]: other })
    await stageLambdaApp(buildDir, app)
    const staged = readFileSync(join(app, ENTRY), 'utf-8')
    expect(staged).not.toBe(other)
    expect(staged).toBe(entry)
  })

  it("LMB-15: serves the handler with the request context's source address", async () => {
    const running = await startEntry(await stagedWithHandler(ECHO_HANDLER))
    try {
      const headers = await receivedHeaders(running.origin, {
        'x-amzn-request-context': JSON.stringify({ http: { sourceIp: '198.51.100.7' } }),
        [CLIENT_ADDRESS]: FORGED_CLIENT
      })
      expect(headers[CLIENT_ADDRESS]).toBe('198.51.100.7')
    } finally {
      stopEntry(running)
    }
  }, 20_000)

  it("LMB-15: drops a client's address header when the context has none", async () => {
    const running = await startEntry(await stagedWithHandler(ECHO_HANDLER))
    try {
      const valid = JSON.stringify({ http: { sourceIp: '198.51.100.7' } })
      const contexts: OutgoingHttpHeaders[] = [
        {},
        { 'x-amzn-request-context': 'not json' },
        { 'x-amzn-request-context': JSON.stringify({ http: { sourceIp: 7 } }) },
        { 'x-amzn-request-context': JSON.stringify({ identity: { sourceIp: '198.51.100.7' } }) },
        { 'x-amzn-request-context': [valid, valid] }
      ]
      for (const context of contexts) {
        const headers = await receivedHeaders(running.origin, { ...context, [CLIENT_ADDRESS]: FORGED_CLIENT, 'x-forwarded-for': FORGED_CLIENT })
        expect(headers).not.toHaveProperty(CLIENT_ADDRESS)
      }
    } finally {
      stopEntry(running)
    }
  }, 20_000)

  it('LMB-15: sets an empty source address as given', async () => {
    const running = await startEntry(await stagedWithHandler(ECHO_HANDLER))
    try {
      const headers = await receivedHeaders(running.origin, { 'x-amzn-request-context': JSON.stringify({ http: { sourceIp: '' } }) })
      expect(headers[CLIENT_ADDRESS]).toBe('')
    } finally {
      stopEntry(running)
    }
  }, 20_000)

  it('LMB-15: answers 404 when the handler passes the request on', async () => {
    const running = await startEntry(await stagedWithHandler(PASSING_HANDLER))
    try {
      const response = await fetch(running.origin)
      expect(response.status).toBe(404)
      expect(await response.text()).toBe('')
    } finally {
      stopEntry(running)
    }
  }, 20_000)

  it('LMB-4: refuses a build without package.json', async () => {
    const { buildDir, app } = buildDirectory({ 'index.js': 'console.log("server")\n' })
    await expect(stageLambdaApp(buildDir, app)).rejects.toThrow(
      new Error(`deploy/no-runtime-package: ${buildDir}/package.json is missing; build with genoa build`)
    )
  })

  it("LMB-5: installs for Linux x64 without a shell, and fails with npm's output", async () => {
    const dir = temporaryRoot()
    writeFileSync(join(dir, 'package.json'), '{ this is not json')
    const install = installProductionDependencies(dir)
    await expect(install).rejects.toThrow(/^deploy\/install-failed: /)
    await expect(install).rejects.toThrow(/EJSONPARSE/)
  }, 120_000)

  it('LMB-6: zips exactly the staged directory, keeping run.sh executable', async () => {
    const { buildDir, app, root } = buildDirectory()
    await stageLambdaApp(buildDir, app)
    const archive = join(root, 'app.zip')
    await zipDirectory(app, archive)
    const files = zipEntries(readFileSync(archive)).filter(entry => !entry.name.endsWith('/'))
    expect(files.map(entry => entry.name).sort()).toEqual(filesUnder(app))
    expect(files.find(entry => entry.name === 'run.sh')?.mode).toBe(0o755)
  })

  it('LMB-6: zips dotfiles and files in dot-directories', async () => {
    const { buildDir, app, root } = buildDirectory({ ...BUILD_FILES, '.npmrc': 'x=1\n', 'node_modules/.bin/x': '#!/bin/sh\n', '.hidden/a.js': 'a\n' })
    await stageLambdaApp(buildDir, app)
    const archive = join(root, 'app.zip')
    await zipDirectory(app, archive)
    const names = zipEntries(readFileSync(archive)).map(entry => entry.name)
    for (const name of ['.npmrc', 'node_modules/.bin/x', '.hidden/a.js']) expect(names).toContain(name)
  })

  it('LMB-6: deflates at level 9', async () => {
    let seed = 1
    const content = Array.from({ length: 200_000 }, () => {
      seed = (seed * 1103515245 + 12345) % 2147483648
      return 'abcdefgh'[seed % 8]
    }).join('')
    const { buildDir, app, root } = buildDirectory({ ...BUILD_FILES, 'data.txt': content })
    await stageLambdaApp(buildDir, app)
    const archive = join(root, 'app.zip')
    await zipDirectory(app, archive)
    const entry = zipEntries(readFileSync(archive)).find(candidate => candidate.name === 'data.txt')
    expect(entry?.method).toBe(8)
    expect(entry?.data).toEqual(deflateRawSync(Buffer.from(content), { level: 9 }))
  })
})
