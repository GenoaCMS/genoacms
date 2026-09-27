import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import procedure from './procedure.js'

const calls: string[] = []
const functionExists = { value: false }
const client = {
  locationPath: (project: string, region: string) => `projects/${project}/locations/${region}`,
  functionPath: (project: string, region: string, name: string) => `projects/${project}/locations/${region}/functions/${name}`,
  generateUploadUrl: vi.fn(async () => { calls.push('generateUploadUrl'); return [{ uploadUrl: 'https://upload.example', storageSource: { bucket: 'b', object: 'o' } }] }),
  getFunction: vi.fn(async () => { calls.push('getFunction'); if (!functionExists.value) throw new Error('not found') }),
  createFunction: vi.fn(async () => { calls.push('createFunction'); return [{}] }),
  updateFunction: vi.fn(async () => { calls.push('updateFunction'); return [{}] })
}
vi.mock('@google-cloud/functions', () => ({ v2: { FunctionServiceClient: vi.fn(function () { return client }) } }))

const roots: string[] = []
beforeEach(() => {
  calls.length = 0
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: { method: string, body: AsyncIterable<unknown> }) => {
    // Read the upload as a real request would, so the archive is opened while it still exists.
    for await (const _chunk of init.body) { /* drain */ }
    calls.push(`${init.method} ${url}`)
    return new Response(null)
  }))
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  while (roots.length > 0) rmSync(roots.pop() as string, { recursive: true, force: true })
})

function context () {
  const root = mkdtempSync(join(tmpdir(), 'genoa-gcp-deploy-'))
  roots.push(root)
  const buildDir = join(root, '.genoacms', 'build')
  const workDir = join(root, '.genoacms', 'deploy', 'gcp')
  mkdirSync(buildDir, { recursive: true })
  mkdirSync(workDir, { recursive: true })
  writeFileSync(join(buildDir, 'index.js'), '\n')
  writeFileSync(join(buildDir, 'package.json'), '{"name":"genoacms-runtime"}')
  return { projectRoot: root, buildDir, workDir, target: 'gcp' }
}

describe('the GCP deploy procedure', () => {
  it('uploads the archive, then creates a function that does not exist yet, named genoacms by default', async () => {
    functionExists.value = false
    const cwd = vi.spyOn(process, 'cwd')
    await procedure({ projectId: 'p', region: 'europe-west3' }, context())
    expect(calls).toEqual(['generateUploadUrl', 'PUT https://upload.example', 'getFunction', 'createFunction'])
    expect(client.createFunction).toHaveBeenLastCalledWith(expect.objectContaining({ functionId: 'genoacms', parent: 'projects/p/locations/europe-west3' }))
    expect(cwd).not.toHaveBeenCalled()
  })

  it('updates a function that exists', async () => {
    functionExists.value = true
    await procedure({ projectId: 'p', region: 'r', functionName: 'cms' }, context())
    expect(calls.at(-1)).toBe('updateFunction')
    expect(client.updateFunction).toHaveBeenLastCalledWith(expect.objectContaining({ functionId: 'cms' }))
  })
})
