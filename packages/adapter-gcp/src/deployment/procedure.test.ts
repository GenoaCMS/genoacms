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
const uploads: Array<{ url: string, method: string, headers: Headers }> = []
beforeEach(() => {
  calls.length = 0
  vi.spyOn(console, 'info').mockImplementation(() => {})
  uploads.length = 0
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: { method: string, body: AsyncIterable<unknown>, headers?: HeadersInit }) => {
    await consumeUploadBody(init.body)
    calls.push(`${init.method} ${url}`)
    uploads.push({ url, method: init.method, headers: new Headers(init.headers) })
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

  it('DEP-8: uploads to the location with the zip content type, and requires a storage source', async () => {
    functionExists.value = false
    await procedure({ projectId: 'p', region: 'europe-west3' }, context())
    expect(client.generateUploadUrl).toHaveBeenLastCalledWith(expect.objectContaining({ parent: 'projects/p/locations/europe-west3' }))
    expect(uploads).toHaveLength(1)
    expect(uploads[0].url).toBe('https://upload.example')
    expect(uploads[0].method).toBe('PUT')
    expect(uploads[0].headers.get('content-type')).toBe('application/zip')
    for (const answer of [{ uploadUrl: 'https://upload.example' }, { storageSource: { bucket: 'b', object: 'o' } }]) {
      calls.length = 0
      client.generateUploadUrl.mockResolvedValueOnce([answer] as any)
      await expect(procedure({ projectId: 'p', region: 'r' }, context())).rejects.toThrow('Upload URL not found')
      expect(calls.filter(call => call !== 'generateUploadUrl')).toEqual([])
    }
  })

  it('DEP-10: sends no update mask and no unset setting', async () => {
    const unsetKeys = ['availableMemory', 'timeoutSeconds', 'serviceAccountEmail']
    const request = (mock: typeof client.createFunction) => (mock.mock.calls.at(-1) as unknown as [Record<string, any>])[0]
    functionExists.value = true
    await procedure({ projectId: 'p', region: 'r' }, context())
    const update = request(client.updateFunction)
    expect(update).not.toHaveProperty('updateMask')
    expect(Object.keys(update).sort()).toEqual(['function', 'functionId', 'parent'])
    for (const key of unsetKeys) expect(update.function.serviceConfig).not.toHaveProperty(key)
    functionExists.value = false
    await procedure({ projectId: 'p', region: 'r' }, context())
    const create = request(client.createFunction)
    expect(create).not.toHaveProperty('updateMask')
    for (const key of unsetKeys) expect(create.function.serviceConfig).not.toHaveProperty(key)
    expect(create).toEqual({
      functionId: 'genoacms',
      parent: 'projects/p/locations/r',
      function: {
        name: 'projects/p/locations/r/functions/genoacms',
        buildConfig: { entryPoint: 'genoacms', runtime: 'nodejs22', source: { storageSource: { bucket: 'b', object: 'o' } } },
        serviceConfig: { minInstanceCount: 0, maxInstanceCount: 1, ingressSettings: 1, environmentVariables: expect.objectContaining({ NODE_ENV: 'production' }) }
      }
    })
  })

  it('DEP-11: keeps the operation\'s error as cause', async () => {
    functionExists.value = false
    const failure = new Error('Build failed: npm ERR! 404')
    client.createFunction.mockResolvedValueOnce([operation(async () => { throw failure })])
    const error = await procedure({ projectId: 'p', region: 'r' }, context()).then(() => undefined, (rejection: unknown) => rejection)
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toBe('deploy/function-failed: Build failed: npm ERR! 404')
    expect((error as Error).cause).toBe(failure)
  })

  it('DEP-12: prefers url over serviceConfig.uri, falls back to it, and prints nothing without either', async () => {
    functionExists.value = false
    const printed = (): string[] => vi.mocked(console.info).mock.calls.map(call => String(call[0])).filter(line => line.startsWith('Function URL'))
    const deployReturning = async (fn: Record<string, unknown>): Promise<string[]> => {
      vi.mocked(console.info).mockClear()
      client.createFunction.mockResolvedValueOnce([operation(async () => [fn])])
      await procedure({ projectId: 'p', region: 'r' }, context())
      return printed()
    }
    expect(await deployReturning({ url: 'https://url.example', serviceConfig: { uri: 'https://uri.example' } })).toEqual(['Function URL: https://url.example'])
    expect(await deployReturning({ serviceConfig: { uri: 'https://uri.example' } })).toEqual(['Function URL: https://uri.example'])
    expect(await deployReturning({ serviceConfig: {} })).toEqual([])
    expect(await deployReturning({})).toEqual([])
  })
})
