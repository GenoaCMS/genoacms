import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import procedure from './procedure.js'

const calls: string[] = []
const functionExists = { value: false }
const operation = (result: () => Promise<unknown[]> = async () => [{ url: 'https://fn.example' }]) => ({ promise: result })
const notFound = Object.assign(new Error('not found'), { code: 5 })
const client = {
  locationPath: (project: string, region: string) => `projects/${project}/locations/${region}`,
  functionPath: (project: string, region: string, name: string) => `projects/${project}/locations/${region}/functions/${name}`,
  generateUploadUrl: vi.fn(async () => { calls.push('generateUploadUrl'); return [{ uploadUrl: 'https://upload.example', storageSource: { bucket: 'b', object: 'o' } }] }),
  getFunction: vi.fn(async () => { calls.push('getFunction'); if (!functionExists.value) throw notFound }),
  createFunction: vi.fn(async () => { calls.push('createFunction'); return [operation()] }),
  updateFunction: vi.fn(async () => { calls.push('updateFunction'); return [operation()] })
}
const clientOptions: unknown[] = []
vi.mock('@google-cloud/functions', () => ({ v2: { FunctionServiceClient: vi.fn(function (options: unknown) { clientOptions.push(options); return client }) } }))

async function consumeUploadBody (body: AsyncIterable<unknown>): Promise<void> {
  for await (const _chunk of body) continue
}

const roots: string[] = []
beforeEach(() => {
  calls.length = 0
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: { method: string, body: AsyncIterable<unknown> }) => {
    await consumeUploadBody(init.body)
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
  it('DEP-5, DEP-8, DEP-9: uploads the archive, then creates a function that does not exist yet, named genoacms by default', async () => {
    functionExists.value = false
    const cwd = vi.spyOn(process, 'cwd')
    await procedure({ projectId: 'p', region: 'europe-west3' }, context())
    expect(calls).toEqual(['generateUploadUrl', 'PUT https://upload.example', 'getFunction', 'createFunction'])
    expect(client.createFunction).toHaveBeenLastCalledWith(expect.objectContaining({ functionId: 'genoacms', parent: 'projects/p/locations/europe-west3' }))
    expect(cwd).not.toHaveBeenCalled()
  })

  it('DEP-9: updates a function that exists', async () => {
    functionExists.value = true
    await procedure({ projectId: 'p', region: 'r', functionName: 'cms' }, context())
    expect(calls.at(-1)).toBe('updateFunction')
    expect(client.updateFunction).toHaveBeenLastCalledWith(expect.objectContaining({ functionId: 'cms' }))
  })

  it('DEP-8: stops when the upload is refused, before touching the function', async () => {
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: { body: AsyncIterable<unknown> }) => {
      await consumeUploadBody(init.body)
      return new Response(null, { status: 403, statusText: 'Forbidden' })
    }))
    await expect(procedure({ projectId: 'p', region: 'r' }, context())).rejects.toThrow(/^deploy\/upload-failed: 403 Forbidden/)
    expect(client.createFunction).not.toHaveBeenCalled()
  })

  it('DEP-9: propagates a lookup error other than NOT_FOUND instead of creating', async () => {
    const denied = Object.assign(new Error('permission denied'), { code: 7 })
    client.getFunction.mockRejectedValueOnce(denied)
    await expect(procedure({ projectId: 'p', region: 'r' }, context())).rejects.toBe(denied)
    expect(client.createFunction).not.toHaveBeenCalled()
    expect(client.updateFunction).not.toHaveBeenCalled()
  })

  it('DEP-11: fails when the platform fails to build the function', async () => {
    functionExists.value = false
    client.createFunction.mockResolvedValueOnce([operation(async () => { throw new Error('Build failed: npm ERR! 404') })])
    await expect(procedure({ projectId: 'p', region: 'r' }, context())).rejects.toThrow(/^deploy\/function-failed: Build failed: npm ERR! 404/)
  })

  it('DEP-12: prints the function URL once the platform is done', async () => {
    functionExists.value = false
    await procedure({ projectId: 'p', region: 'r' }, context())
    expect(console.info).toHaveBeenCalledWith('Function URL: https://fn.example')
  })

  it('DEP-10: builds on nodejs22 and runs as the configured service account', async () => {
    functionExists.value = false
    await procedure({ projectId: 'p', region: 'r', serviceAccount: 'cms@p.iam.gserviceaccount.com' }, context())
    expect(client.createFunction).toHaveBeenLastCalledWith(expect.objectContaining({
      function: expect.objectContaining({
        buildConfig: expect.objectContaining({ runtime: 'nodejs22' }),
        serviceConfig: expect.objectContaining({ serviceAccountEmail: 'cms@p.iam.gserviceaccount.com' })
      })
    }))
  })

  it("DEP-13: uses the target's credentials for the Functions client, and ADC without them", async () => {
    functionExists.value = true
    clientOptions.length = 0
    await procedure({ projectId: 'p', region: 'r', credentials: { client_email: 'op' } as any }, context())
    await procedure({ projectId: 'p', region: 'r' }, context())
    expect(clientOptions).toEqual([{ credentials: { client_email: 'op' } }, {}])
  })
})
