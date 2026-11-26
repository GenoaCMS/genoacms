import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { memory } from '#lib/script/testing/memoryStorage.js'
import { memorySecrets } from '#lib/script/testing/memorySecrets.js'
import { MANIFEST_PATH, ROOT_SEED_SECRET, testRootSeed, rootSigned } from '#lib/script/testing/keyManifests.js'
import { toBase64 } from './envelope'
import type { JsonValue } from './canonical'

vi.setConfig({ testTimeout: 120_000 })

vi.mock('#lib/script/storage/providers.server.js', async () => (await import('#lib/script/testing/memoryStorage.js')).memoryProviders)
vi.mock('#lib/script/secrets/providers.server.js', async () => (await import('#lib/script/testing/memorySecrets.js')).memorySecretsProviders)

const POLICY_PATH = '.genoacms/security/policy.json'

const registry = async () => await import('./registry.server')
const resolution = async () => await import('./keyResolution.server')

/** Re-signs the bootstrapped manifest with its current key created long before any interval. */
const ageCurrentKey = (): void => {
  const { payload } = memory.json(MANIFEST_PATH) as { payload: { current: string, keys: Array<{ keyId: string, createdAt: number }> } }
  const keys = payload.keys.map(entry => entry.keyId === payload.current ? { ...entry, createdAt: 1_000 } : entry)
  memory.set(MANIFEST_PATH, JSON.stringify(rootSigned('genoacms.keyRegistry.v2', { ...payload, keys } as unknown as JsonValue)))
}

beforeEach(() => {
  vi.resetModules()
  memory.clear()
  memorySecrets.clear()
  memorySecrets.set(ROOT_SEED_SECRET, toBase64(testRootSeed))
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('rotation when due', () => {
  it('POL-3: the current key does not rotate when due while the policy is damaged', async () => {
    const { registry: bootstrapped } = await (await registry()).loadOrBootstrapRegistry()
    ageCurrentKey()
    memory.set(POLICY_PATH, 'not json {')
    const manifest = memory.text(MANIFEST_PATH)
    const secrets = [...memorySecrets.values.keys()].sort()
    vi.resetModules()

    const key = await (await resolution()).getCurrentSigningKey()

    expect(key.keyId).toBe(bootstrapped.current)
    expect(memory.text(MANIFEST_PATH)).toBe(manifest)
    expect([...memorySecrets.values.keys()].sort()).toEqual(secrets)
    expect(memory.text(POLICY_PATH)).toBe('not json {')
  })
})
