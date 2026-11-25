import { describe, it, expect, vi, beforeEach } from 'vitest'
import { memory } from '#lib/script/testing/memoryStorage.js'
import { memorySecrets } from '#lib/script/testing/memorySecrets.js'
import {
  MANIFEST_PATH, ROOT_SEED_SECRET, REGISTRY_SEQUENCE_SECRET, testRootSeed, subordinateKeypair, registeredKeyOf, rootSigned
} from '#lib/script/testing/keyManifests.js'
import { toBase64 } from './envelope'
import type { JsonValue } from './canonical'

vi.setConfig({ testTimeout: 60_000 })

vi.mock('#lib/script/storage/providers.server.js', async () => (await import('#lib/script/testing/memoryStorage.js')).memoryProviders)
vi.mock('#lib/script/secrets/providers.server.js', async () => (await import('#lib/script/testing/memorySecrets.js')).memorySecretsProviders)

const sequence = async () => await import('./registrySequence.server')
const registry = async () => await import('./registry.server')

const manifestAt = (at: number): string => {
  const entry = registeredKeyOf(subordinateKeypair(1).publicKey)
  return JSON.stringify(rootSigned('genoacms.keyRegistry.v2', { sequence: at, current: entry.keyId, keys: [entry] } as unknown as JsonValue))
}

beforeEach(() => {
  vi.resetModules()
  memory.clear()
  memorySecrets.clear()
  memorySecrets.set(ROOT_SEED_SECRET, toBase64(testRootSeed))
})

describe('the mark', () => {
  it('REG-4: a mark of another form fails every load', async () => {
    const { readHighWaterMark, checkAndAdvance } = await sequence()

    for (const value of ['1e3', ' 5', '05', '-1', '']) {
      memorySecrets.set(REGISTRY_SEQUENCE_SECRET, value)
      const message = `registry-sequence/unreadable: GENOACMS_KEY_REGISTRY_SEQUENCE is '${value}'`

      await expect(readHighWaterMark()).rejects.toMatchObject({ message })
      await expect(checkAndAdvance(1)).rejects.toMatchObject({ message })
    }
  })

  it('REG-4: a manifest below the mark is refused and a higher one raises it', async () => {
    memorySecrets.set(REGISTRY_SEQUENCE_SECRET, '5')
    const { loadRegistry } = await registry()

    memory.set(MANIFEST_PATH, manifestAt(4))
    expect(await loadRegistry())
      .toEqual({ ok: false, absent: false, reason: 'registry-rollback: sequence 4 is below the highest seen (5)' })
    expect(memorySecrets.get(REGISTRY_SEQUENCE_SECRET)).toBe('5')

    memory.set(MANIFEST_PATH, manifestAt(6))
    expect(await loadRegistry()).toMatchObject({ ok: true })
    expect(memorySecrets.get(REGISTRY_SEQUENCE_SECRET)).toBe('6')
  })
})
