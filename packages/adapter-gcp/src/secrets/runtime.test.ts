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
  it('COM-4, SEC-2: uses Application Default Credentials when no credentials are configured', async () => {
    await runtime.create({ projectId: 'p' }, { name: 's', resources: [] })
    expect(constructed.at(-1)).toEqual({ projectId: 'p' })
  })

  it('SEC-3, SEC-4: reads a missing secret as undefined, and propagates every other failure', async () => {
    const secrets = await runtime.create({ projectId: 'p' }, { name: 's', resources: [] })
    client.accessSecretVersion.mockRejectedValueOnce(grpcError(5))
    expect(await secrets.getSecret('KEY')).toBeUndefined()
    client.accessSecretVersion.mockRejectedValueOnce(grpcError(9))
    await expect(secrets.getSecret('KEY')).rejects.toThrow('grpc 9')
    expect(client.accessSecretVersion).toHaveBeenLastCalledWith({ name: 'projects/p/secrets/KEY/versions/latest' })
  })

  it('SEC-6: loses a claim when the secret already exists', async () => {
    const secrets = await runtime.create({ projectId: 'p' }, { name: 's', resources: [] })
    client.createSecret.mockRejectedValueOnce(grpcError(6))
    expect(await secrets.setSecretIfAbsent('KEY', 'v')).toBe(false)
    expect(client.addSecretVersion).not.toHaveBeenCalled()
  })

  it('SEC-5, SEC-6, SEC-7: creates secrets with a seven-day recovery window on both create paths', async () => {
    const secrets = await runtime.create({ projectId: 'p' }, { name: 's', resources: [] })
    client.getSecret.mockRejectedValueOnce(grpcError(5))
    await secrets.setSecret('KEY', 'v')
    expect(client.createSecret).toHaveBeenLastCalledWith({ parent: 'projects/p', secretId: 'KEY', secret: withDestroyWindow })
    await secrets.setSecretIfAbsent('OTHER', 'v')
    expect(client.createSecret).toHaveBeenLastCalledWith({ parent: 'projects/p', secretId: 'OTHER', secret: withDestroyWindow })
  })

  it('SEC-8: destroys only the enabled versions below the one it added', async () => {
    const secrets = await runtime.create({ projectId: 'p' }, { name: 's', resources: [] })
    client.listSecretVersions.mockResolvedValueOnce([[version(1), version(2), version(3), version(4)]])
    expect(await secrets.setSecret('KEY', 'v')).toBe(true)
    expect(client.listSecretVersions).toHaveBeenLastCalledWith({ parent: 'projects/p/secrets/KEY', filter: 'state:ENABLED' })
    expect(client.destroySecretVersion.mock.calls).toEqual([[version(1)], [version(2)]])
  })

  it('SEC-9: keeps the written value when cleanup fails, and warns', async () => {
    const secrets = await runtime.create({ projectId: 'p' }, { name: 's', resources: [] })
    client.listSecretVersions.mockRejectedValueOnce(grpcError(7))
    expect(await secrets.setSecret('KEY', 'v')).toBe(true)
    expect(console.warn).toHaveBeenCalledOnce()
    expect(vi.mocked(console.warn).mock.calls[0][0]).toMatch(/^secrets\/cleanup-failed: KEY:/)
  })

  it('SEC-9: destroys nothing when a version name is not numbered', async () => {
    const secrets = await runtime.create({ projectId: 'p' }, { name: 's', resources: [] })
    client.addSecretVersion.mockResolvedValueOnce([version('latest')])
    expect(await secrets.setSecret('KEY', 'v')).toBe(true)
    expect(console.warn).toHaveBeenCalledOnce()
    expect(client.destroySecretVersion).not.toHaveBeenCalled()
  })

  it('SEC-3: decodes the payload as UTF-8, and reads a missing payload as undefined', async () => {
    const secrets = await runtime.create({ projectId: 'p' }, { name: 's', resources: [] })
    const answer = (payload: unknown) => client.accessSecretVersion.mockResolvedValueOnce([{ payload }])
    answer({ data: Buffer.from('é', 'utf-8') })
    expect(await secrets.getSecret('KEY')).toBe('é')
    answer({ data: new Uint8Array(Buffer.from('é', 'utf-8')) })
    expect(await secrets.getSecret('KEY')).toBe('é')
    answer({ data: 's' })
    expect(await secrets.getSecret('KEY')).toBe('s')
    answer(undefined)
    expect(await secrets.getSecret('KEY')).toBeUndefined()
  })

  it('SEC-5: overwrites an existing secret without creating it', async () => {
    const secrets = await runtime.create({ projectId: 'p' }, { name: 's', resources: [] })
    client.getSecret.mockResolvedValueOnce([{}])
    expect(await secrets.setSecret('KEY', 'v')).toBe(true)
    expect(client.getSecret).toHaveBeenCalledWith({ name: 'projects/p/secrets/KEY' })
    expect(client.createSecret).not.toHaveBeenCalled()
    expect(client.addSecretVersion).toHaveBeenCalledWith({ parent: 'projects/p/secrets/KEY', payload: { data: Buffer.from('v', 'utf-8') } })
  })

  it('SEC-5: tolerates a concurrent creator when overwriting', async () => {
    const secrets = await runtime.create({ projectId: 'p' }, { name: 's', resources: [] })
    client.getSecret.mockRejectedValueOnce(grpcError(5))
    client.createSecret.mockRejectedValueOnce(grpcError(6))
    expect(await secrets.setSecret('KEY', 'v')).toBe(true)
    expect(client.addSecretVersion).toHaveBeenCalled()
  })

  it('SEC-10: claims without cleaning up', async () => {
    const secrets = await runtime.create({ projectId: 'p' }, { name: 's', resources: [] })
    client.createSecret.mockResolvedValueOnce([{}])
    expect(await secrets.setSecretIfAbsent('KEY', 'v')).toBe(true)
    expect(client.listSecretVersions).not.toHaveBeenCalled()
  })

  it('SEC-11: deletes a secret, reporting whether it existed', async () => {
    const secrets = await runtime.create({ projectId: 'p' }, { name: 's', resources: [] })
    client.deleteSecret.mockResolvedValueOnce([{}])
    expect(await secrets.deleteSecret('KEY')).toBe(true)
    expect(client.deleteSecret).toHaveBeenLastCalledWith({ name: 'projects/p/secrets/KEY' })
    client.deleteSecret.mockRejectedValueOnce(grpcError(5))
    expect(await secrets.deleteSecret('KEY')).toBe(false)
    client.deleteSecret.mockRejectedValueOnce(grpcError(7))
    await expect(secrets.deleteSecret('KEY')).rejects.toThrow('grpc 7')
  })

  it('SEC-3: an empty payload reads as the empty string', async () => {
    const secrets = await runtime.create({ projectId: 'p' }, { name: 's', resources: [] })
    client.accessSecretVersion.mockResolvedValueOnce([{ payload: { data: Buffer.alloc(0) } }])
    expect(await secrets.getSecret('KEY')).toBe('')
    client.accessSecretVersion.mockResolvedValueOnce([{ payload: { data: new Uint8Array(0) } }])
    expect(await secrets.getSecret('KEY')).toBe('')
  })

  it('SEC-4: other failures propagate as the same error object', async () => {
    const secrets = await runtime.create({ projectId: 'p' }, { name: 's', resources: [] })
    const failure = grpcError(7)
    client.accessSecretVersion.mockRejectedValueOnce(failure)
    await expect(secrets.getSecret('KEY')).rejects.toBe(failure)
  })

  it('SEC-5: propagates an error of the existence check, and any createSecret error but ALREADY_EXISTS', async () => {
    const secrets = await runtime.create({ projectId: 'p' }, { name: 's', resources: [] })
    const checkFailure = grpcError(7)
    client.getSecret.mockRejectedValueOnce(checkFailure)
    await expect(secrets.setSecret('KEY', 'v')).rejects.toBe(checkFailure)
    expect(client.createSecret).not.toHaveBeenCalled()
    for (const code of [7, 9, 13]) {
      const createFailure = grpcError(code)
      client.getSecret.mockRejectedValueOnce(grpcError(5))
      client.createSecret.mockRejectedValueOnce(createFailure)
      await expect(secrets.setSecret('KEY', 'v')).rejects.toBe(createFailure)
    }
    expect(client.addSecretVersion).not.toHaveBeenCalled()
  })

  it('SEC-6: propagates every createSecret error but ALREADY_EXISTS', async () => {
    const secrets = await runtime.create({ projectId: 'p' }, { name: 's', resources: [] })
    for (const code of [5, 7, 9, 13]) {
      const failure = grpcError(code)
      client.createSecret.mockRejectedValueOnce(failure)
      await expect(secrets.setSecretIfAbsent('KEY', 'v')).rejects.toBe(failure)
    }
    expect(client.addSecretVersion).not.toHaveBeenCalled()
  })

  it('SEC-8: keeps a version numbered 0 or not a number', async () => {
    const secrets = await runtime.create({ projectId: 'p' }, { name: 's', resources: [] })
    for (const unnumbered of [version(0), version('x')]) {
      client.destroySecretVersion.mockClear()
      client.listSecretVersions.mockResolvedValueOnce([[version(1), version(2), version(3), unnumbered]])
      expect(await secrets.setSecret('KEY', 'v')).toBe(true)
      expect(client.destroySecretVersion.mock.calls).toEqual([[version(1)], [version(2)]])
    }
  })
})
