import { describe, it, expect, vi } from 'vitest'
import runtime from './runtime.js'

const client = {
  accessSecretVersion: vi.fn(),
  createSecret: vi.fn(),
  addSecretVersion: vi.fn(),
  getSecret: vi.fn(),
  deleteSecret: vi.fn()
}
const constructed: unknown[] = []
vi.mock('@google-cloud/secret-manager', () => ({
  SecretManagerServiceClient: vi.fn(function (options: unknown) { constructed.push(options); return client })
}))

const grpcError = (code: number): Error => Object.assign(new Error(`grpc ${code}`), { code })

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
})
