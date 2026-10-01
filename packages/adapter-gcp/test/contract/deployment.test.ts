import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { v2 } from '@google-cloud/functions'
import procedure from '../../src/deployment/procedure.js'
import { enabled, projectId, region, functionName, GRPC_NOT_FOUND } from './gcp.js'

const TEN_MINUTES = 10 * 60 * 1000
const artifactDir = fileURLToPath(new URL('./artifact', import.meta.url))
const roots: string[] = []

let client: InstanceType<typeof v2.FunctionServiceClient>
let name = ''

function deployContext (buildDir: string) {
  const root = mkdtempSync(join(tmpdir(), 'genoa-gcp-contract-'))
  roots.push(root)
  const workDir = join(root, 'work')
  cpSync(buildDir, join(root, 'build'), { recursive: true })
  return { projectRoot: root, buildDir: join(root, 'build'), workDir, target: 'gcp' }
}

function brokenArtifact (): string {
  const dir = mkdtempSync(join(tmpdir(), 'genoa-gcp-broken-'))
  roots.push(dir)
  cpSync(artifactDir, dir, { recursive: true })
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: 'genoacms-runtime',
    type: 'module',
    dependencies: { 'genoacms-contract-no-such-package': '1.0.0' }
  }))
  return dir
}

async function deployedFunction () {
  const [deployed] = await client.getFunction({ name })
  return deployed
}

async function deleteIfPresent (): Promise<void> {
  try {
    const [operation] = await client.deleteFunction({ name })
    await operation.promise()
  } catch (error) {
    if ((error as { code?: number }).code !== GRPC_NOT_FOUND) throw error
  }
}

describe.runIf(enabled)('Cloud Run functions deploy, against the real service', { timeout: TEN_MINUTES }, () => {
  beforeAll(() => {
    client = new v2.FunctionServiceClient()
    name = client.functionPath(projectId, region, functionName)
  })

  afterAll(async () => {
    await deleteIfPresent()
    for (const root of roots) rmSync(root, { recursive: true, force: true })
  }, TEN_MINUTES)

  it("DEP-8, DEP-9, DEP-10, DEP-12, DEP-13: creates a function that does not exist, with the operator's ADC, and prints its URL", async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    await procedure({ projectId, region, functionName }, deployContext(artifactDir))
    expect(info).toHaveBeenCalledWith(expect.stringMatching(/^Function URL: https:\/\//))
    info.mockRestore()
    const deployed = await deployedFunction()
    expect(deployed.state).toBe('ACTIVE')
    expect(deployed.buildConfig?.entryPoint).toBe('genoacms')
    expect(deployed.buildConfig?.runtime).toBe('nodejs22')
    expect(deployed.serviceConfig?.environmentVariables).toMatchObject({ NODE_ENV: 'production' })
    expect(deployed.serviceConfig?.environmentVariables).toHaveProperty('IGNORED_ROUTES', '')
    expect(deployed.serviceConfig?.environmentVariables).not.toHaveProperty('ORIGIN')
    expect(deployed.serviceConfig?.environmentVariables).not.toHaveProperty('XFF_DEPTH')
    expect(deployed.serviceConfig?.maxInstanceCount).toBe(1)
    expect(deployed.serviceConfig?.ingressSettings).toBe('ALLOW_ALL')
  })

  it('DEP-9, DEP-10: updates the function that exists', async () => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    await procedure({ projectId, region, functionName, maxInstances: 2 }, deployContext(artifactDir))
    vi.restoreAllMocks()
    expect((await deployedFunction()).serviceConfig?.maxInstanceCount).toBe(2)
  })

  it('DEP-11: fails with deploy/function-failed when the platform cannot build the artifact, and keeps the previous revision', async () => {
    const failed = procedure({ projectId, region, functionName, maxInstances: 2 }, deployContext(brokenArtifact()))
    await expect(failed).rejects.toThrow(/^deploy\/function-failed: /)
    const deployed = await deployedFunction()
    expect(deployed.state).toBe('ACTIVE')
    expect(deployed.serviceConfig?.maxInstanceCount).toBe(2)
  })
})
