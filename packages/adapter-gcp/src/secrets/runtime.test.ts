import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import runtime from './runtime.js'

const client = {
  accessSecretVersion: vi.fn(),
  createSecret: vi.fn(),
  addSecretVersion: vi.fn(),
  getSecret: vi.fn(),
  deleteSecret: vi.fn(),
  listSecretVersions: vi.fn(),
  destroySecretVersion: vi.fn()
}
const constructed: unknown[] = []
vi.mock('@google-cloud/secret-manager', () => ({
  SecretManagerServiceClient: vi.fn(function (options: unknown) { constructed.push(options); return client })
}))

const grpcError = (code: number): Error => Object.assign(new Error(`grpc ${code}`), { code })
const version = (n: number | string): { name: string } => ({ name: `projects/p/secrets/KEY/versions/${n}` })
const withDestroyWindow = { replication: { automatic: {} }, versionDestroyTtl: { seconds: 604800 } }

beforeEach(() => {
  client.addSecretVersion.mockResolvedValue([version(3)])
  client.listSecretVersions.mockResolvedValue([[]])
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => { vi.clearAllMocks(); vi.restoreAllMocks() })

describe('the Secret Manager runtime', () => {
  it('uses Application Default Credentials when no credentials are configured', async () => {
    await runtime.create({ projectId: 'p' }, { name: 's', resources: [] })
    expect(constructed.at(-1)).toEqual({ projectId: 'p' })
  })

  it('reads a missing secret as undefined, and propagates every other failure', async () => {
    const secrets = await runtime.create({ projectId: 'p' }, { name: 's', resources: [] })
    client.accessSecretVersion.mockRejectedValueOnce(grpcError(5))
    expect(await secrets.getSecret('KEY')).toBeUndefined()
    client.accessSecretVersion.mockRejectedValueOnce(grpcError(9))
    await expect(secrets.getSecret('KEY')).rejects.toThrow('grpc 9')
    expect(client.accessSecretVersion).toHaveBeenLastCalledWith({ name: 'projects/p/secrets/KEY/versions/latest' })
  })

  it('loses a claim when the secret already exists', async () => {
    const secrets = await runtime.create({ projectId: 'p' }, { name: 's', resources: [] })
    client.createSecret.mockRejectedValueOnce(grpcError(6))
    expect(await secrets.setSecretIfAbsent('KEY', 'v')).toBe(false)
    expect(client.addSecretVersion).not.toHaveBeenCalled()
  })

  it('creates secrets with a seven-day recovery window on both create paths', async () => {
    const secrets = await runtime.create({ projectId: 'p' }, { name: 's', resources: [] })
    client.getSecret.mockRejectedValueOnce(grpcError(5))
    await secrets.setSecret('KEY', 'v')
    expect(client.createSecret).toHaveBeenLastCalledWith({ parent: 'projects/p', secretId: 'KEY', secret: withDestroyWindow })
    await secrets.setSecretIfAbsent('OTHER', 'v')
    expect(client.createSecret).toHaveBeenLastCalledWith({ parent: 'projects/p', secretId: 'OTHER', secret: withDestroyWindow })
  })

  it('destroys only the enabled versions below the one it added', async () => {
    const secrets = await runtime.create({ projectId: 'p' }, { name: 's', resources: [] })
    client.listSecretVersions.mockResolvedValueOnce([[version(1), version(2), version(3), version(4)]])
    expect(await secrets.setSecret('KEY', 'v')).toBe(true)
    expect(client.listSecretVersions).toHaveBeenLastCalledWith({ parent: 'projects/p/secrets/KEY', filter: 'state:ENABLED' })
    expect(client.destroySecretVersion.mock.calls).toEqual([[version(1)], [version(2)]])
  })

  it('keeps the written value when cleanup fails, and warns', async () => {
    const secrets = await runtime.create({ projectId: 'p' }, { name: 's', resources: [] })
    client.listSecretVersions.mockRejectedValueOnce(grpcError(7))
    expect(await secrets.setSecret('KEY', 'v')).toBe(true)
    expect(console.warn).toHaveBeenCalledOnce()
    expect(vi.mocked(console.warn).mock.calls[0][0]).toMatch(/^secrets\/cleanup-failed: KEY:/)
  })

  it('destroys nothing when a version name is not numbered', async () => {
    const secrets = await runtime.create({ projectId: 'p' }, { name: 's', resources: [] })
    client.addSecretVersion.mockResolvedValueOnce([version('latest')])
    expect(await secrets.setSecret('KEY', 'v')).toBe(true)
    expect(console.warn).toHaveBeenCalledOnce()
    expect(client.destroySecretVersion).not.toHaveBeenCalled()
  })
})
