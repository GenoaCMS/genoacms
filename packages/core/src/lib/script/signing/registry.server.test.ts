import { describe, it, expect, vi, beforeEach } from 'vitest'
import { isPreconditionFailed } from '@genoacms/contracts/storage'
import { memory, memoryProviders } from '#lib/script/testing/memoryStorage.js'
import { memorySecrets } from '#lib/script/testing/memorySecrets.js'
import {
  MANIFEST_PATH, KEY_FILE_PATTERN, ROOT_SEED_SECRET, REGISTRY_SEQUENCE_SECRET, subordinateSeedSecret,
  testRootSeed, keyFilePathOf, subordinateKeypair, rootSigned
} from '#lib/script/testing/keyManifests.js'
import { toBase64, fromBase64, verify } from './envelope'
import { deriveKeyId } from './keyId'
import { ROOT_ALGORITHM, SUBORDINATE_ALGORITHM } from './algorithms'
import type { JsonValue } from './canonical'

vi.setConfig({ testTimeout: 120_000 })

const recorded = vi.hoisted(() => ({
  log: [] as string[],
  afterRead: undefined as undefined | ((name: string) => void),
  beforeWrite: undefined as undefined | ((name: string, text: string) => void)
}))

vi.mock('#lib/script/storage/providers.server.js', async () => {
  const { memoryProviders } = await import('#lib/script/testing/memoryStorage.js')
  type Reference = Parameters<typeof memoryProviders.getObject>[0]
  return {
    ...memoryProviders,
    getObject: async (reference: Reference) => {
      recorded.log.push(`read ${reference.name}`)
      const object = await memoryProviders.getObject(reference)
      recorded.afterRead?.(reference.name)
      return object
    },
    uploadObject: async (reference: Reference, data: unknown, options: unknown) => {
      recorded.beforeWrite?.(reference.name, String(data))
      await memoryProviders.uploadObject(reference, data as never, options as never)
      recorded.log.push(`write ${reference.name}`)
    },
    deleteObject: async (reference: Reference) => {
      recorded.log.push(`delete ${reference.name}`)
      await memoryProviders.deleteObject(reference)
    }
  }
})
vi.mock('#lib/script/secrets/providers.server.js', async () => {
  const { memorySecretsProviders } = await import('#lib/script/testing/memorySecrets.js')
  return {
    ...memorySecretsProviders,
    setSecret: async (key: string, value: string) => {
      recorded.log.push(`secret ${key}=${value}`)
      return await memorySecretsProviders.setSecret(key, value)
    },
    deleteSecret: async (key: string) => {
      recorded.log.push(`delete-secret ${key}`)
      return await memorySecretsProviders.deleteSecret(key)
    }
  }
})
vi.mock('#lib/script/securityPolicy/policy.server.js', async (importOriginal) => ({
  ...await importOriginal<typeof import('#lib/script/securityPolicy/policy.server.js')>(),
  loadSecurityPolicy: async () => (await import('#lib/script/testing/signingKeys.js')).testSecurityPolicy
}))

const registry = async () => await import('./registry.server')
const resolution = async () => await import('./keyResolution.server')
const rootRotation = async () => await import('./rootRotation.server')

const isOrderedEvent = (event: string): boolean =>
  event.startsWith('write ') || event.startsWith('delete') || event.startsWith(`secret ${REGISTRY_SEQUENCE_SECRET}=`)

const orderedEvents = (): string[] => recorded.log.filter(isOrderedEvent)

const keyFileReads = (): string[] =>
  recorded.log.filter(event => event.startsWith('read ') && KEY_FILE_PATTERN.test(event.slice('read '.length)))

const manifestPayload = (): Record<string, unknown> => memory.json(MANIFEST_PATH).payload

const entryOf = (keyId: string): Record<string, unknown> | undefined =>
  (manifestPayload().keys as Array<Record<string, unknown>>).find(entry => entry.keyId === keyId)

const clearLog = (): void => { recorded.log.length = 0 }

const removeStored = async (name: string): Promise<void> => {
  if (memory.has(name)) await memoryProviders.deleteObject({ bucket: memory.bucket, name })
}

const bootstrapped = async (): Promise<string> => {
  const { registry: manifest } = await (await registry()).loadOrBootstrapRegistry() as unknown as { registry: { current: string } }
  clearLog()
  return manifest.current
}

const rotated = async (): Promise<{ outgoing: string, incoming: string }> => {
  const outgoing = await bootstrapped()
  const manifest = await (await registry()).rotateSubordinateKey() as unknown as { current: string }
  clearLog()
  return { outgoing, incoming: manifest.current }
}

beforeEach(() => {
  vi.resetModules()
  memory.clear()
  memorySecrets.clear()
  memorySecrets.set(ROOT_SEED_SECRET, toBase64(testRootSeed))
  clearLog()
  recorded.afterRead = undefined
  recorded.beforeWrite = undefined
})

const plantAtFirstKeyFileWrite = (textFor: (name: string, written: string) => string): { planted: string[] } => {
  const planted: string[] = []
  recorded.beforeWrite = (name, written) => {
    if (planted.length > 0 || !KEY_FILE_PATTERN.test(name)) return
    planted.push(name)
    memory.set(name, textFor(name, written))
  }
  return { planted }
}

describe('rotating and revoking', () => {
  it('REG-3: a rotation writes the new key\'s file before the manifest, and the mark last', async () => {
    await bootstrapped()

    const manifest = await (await registry()).rotateSubordinateKey() as unknown as { current: string }

    expect(orderedEvents()).toEqual([
      `write ${keyFilePathOf(manifest.current)}`,
      `write ${MANIFEST_PATH}`,
      `secret ${REGISTRY_SEQUENCE_SECRET}=2`
    ])
    expect(memory.json(MANIFEST_PATH)).toMatchObject({ type: 'genoacms.keyRegistry.v2', payload: { sequence: 2, current: manifest.current } })
  })

  it('REG-3: a rotation that cannot write its key file writes no manifest', async () => {
    await bootstrapped()
    const manifestBefore = memory.text(MANIFEST_PATH)
    const markBefore = memorySecrets.get(REGISTRY_SEQUENCE_SECRET)
    const { planted } = plantAtFirstKeyFileWrite((name) => JSON.stringify({
      keyId: name.slice('.genoacms/keys/public/'.length, -'.json'.length),
      alg: SUBORDINATE_ALGORITHM,
      publicKey: toBase64(subordinateKeypair(9).publicKey)
    }))

    const rotation = (await registry()).rotateSubordinateKey()

    await expect(rotation).rejects.toThrow(/^registry\/key-file-conflict: [0-9a-f]{16}$/)
    const keyId = planted[0]?.slice('.genoacms/keys/public/'.length, -'.json'.length)
    await expect(rotation).rejects.toThrow(`registry/key-file-conflict: ${keyId}`)
    expect(memory.text(MANIFEST_PATH)).toBe(manifestBefore)
    expect(memorySecrets.get(REGISTRY_SEQUENCE_SECRET)).toBe(markBefore)
  })

  it('REG-3: a key file already written with the same bytes counts as written', async () => {
    await bootstrapped()
    const { planted } = plantAtFirstKeyFileWrite((_name, written) => written)

    const manifest = await (await registry()).rotateSubordinateKey() as unknown as { current: string }

    expect(planted).toEqual([keyFilePathOf(manifest.current)])
    expect(manifestPayload()).toMatchObject({ sequence: 2, current: manifest.current })
  })

  it('REG-3: a revocation writes the manifest and the mark, then deletes the key file and the seed', async () => {
    const { outgoing } = await rotated()

    await (await registry()).revokeSubordinateKey(outgoing)

    expect(orderedEvents()).toEqual([
      `write ${MANIFEST_PATH}`,
      `secret ${REGISTRY_SEQUENCE_SECRET}=3`,
      `delete ${keyFilePathOf(outgoing)}`,
      `delete-secret ${subordinateSeedSecret(outgoing)}`
    ])
    expect(memory.has(keyFilePathOf(outgoing))).toBe(false)
    expect(memorySecrets.get(subordinateSeedSecret(outgoing))).toBeUndefined()
    expect(entryOf(outgoing)?.revokedAt).toEqual(expect.any(Number))
  })

  it('REG-3: a revocation whose key file is already gone succeeds', async () => {
    const { outgoing } = await rotated()
    await removeStored(keyFilePathOf(outgoing))

    await (await registry()).revokeSubordinateKey(outgoing)

    expect(memory.json(MANIFEST_PATH)).toMatchObject({ type: 'genoacms.keyRegistry.v2' })
    expect(entryOf(outgoing)?.revokedAt).toEqual(expect.any(Number))
    expect(memorySecrets.get(subordinateSeedSecret(outgoing))).toBeUndefined()
  })

  it('REG-3: a rotation conditional on a manifest that changed meanwhile fails and writes no mark', async () => {
    await bootstrapped()
    const markBefore = memorySecrets.get(REGISTRY_SEQUENCE_SECRET)
    recorded.afterRead = (name) => {
      if (name !== MANIFEST_PATH) return
      recorded.afterRead = undefined
      memory.set(MANIFEST_PATH, memory.text(MANIFEST_PATH) as string)
    }

    const failure = await (await registry()).rotateSubordinateKey().then(() => undefined, (error: unknown) => error)

    expect(isPreconditionFailed(failure)).toBe(true)
    expect(memorySecrets.get(REGISTRY_SEQUENCE_SECRET)).toBe(markBefore)
  })
})

describe('a manifest of the earlier type', () => {
  it('REG-6: a v1 registry is refused and never rewritten', async () => {
    const { publicKey } = subordinateKeypair(3)
    const keyId = deriveKeyId(publicKey)
    memory.set(MANIFEST_PATH, JSON.stringify(rootSigned('genoacms.keyRegistry.v1', {
      sequence: 1,
      current: keyId,
      keys: [{ keyId, alg: SUBORDINATE_ALGORITHM, publicKey: toBase64(publicKey), createdAt: 1_000 }]
    })))
    const stored = memory.text(MANIFEST_PATH)
    const reason = 'registry/needs-migration: .genoacms/keys/public.json is genoacms.keyRegistry.v1, which this version of core does not read'
    const { loadRegistry, loadOrBootstrapRegistry } = await registry()

    expect(await loadRegistry()).toEqual({ ok: false, absent: false, reason })
    await expect(loadOrBootstrapRegistry()).rejects.toThrow(`registry/unusable: ${reason}`)
    expect(memory.text(MANIFEST_PATH)).toBe(stored)
    expect(recorded.log.filter(event => event.startsWith('write '))).toEqual([])
  })
})

describe('rotating the root', () => {
  it('REG-5: root rotation writes a v2 manifest of one key, its key file first, at the mark plus 1', async () => {
    memorySecrets.set(REGISTRY_SEQUENCE_SECRET, '7')
    const { policyPath } = await import('#lib/script/securityPolicy/policy.server.js')

    const result = await (await rootRotation()).rotateRootKey()

    const events = recorded.log
      .filter(event => isOrderedEvent(event) || event.startsWith(`secret ${ROOT_SEED_SECRET}=`))
      .map(event => event.startsWith(`secret ${ROOT_SEED_SECRET}=`) ? 'root seed' : event)
    expect(events).toEqual([
      'root seed',
      `write ${keyFilePathOf(result.subordinateKeyId)}`,
      `write ${MANIFEST_PATH}`,
      `secret ${REGISTRY_SEQUENCE_SECRET}=8`,
      `write ${policyPath}`
    ])
    const verified = verify(memory.json(MANIFEST_PATH), 'genoacms.keyRegistry.v2' as never, {
      alg: ROOT_ALGORITHM,
      publicKey: fromBase64(result.publicKey) as Uint8Array
    })
    expect(verified).toMatchObject({ valid: true, payload: { sequence: 8, current: result.subordinateKeyId } })
    const payload = (verified as unknown as { payload: { keys: JsonValue[] } }).payload
    expect(payload.keys).toEqual([expect.objectContaining({ keyId: result.subordinateKeyId, alg: SUBORDINATE_ALGORITHM })])
    expect(memory.json(keyFilePathOf(result.subordinateKeyId))).toMatchObject({ keyId: result.subordinateKeyId, alg: SUBORDINATE_ALGORITHM })
  })
})

describe('resolving a key in core', () => {
  it('VFY-1: core refuses an unknown or revoked key before reading a key file', async () => {
    const { outgoing } = await rotated()
    await (await registry()).revokeSubordinateKey(outgoing)
    clearLog()
    const { resolveVerificationKey } = await resolution()

    expect(await resolveVerificationKey(outgoing))
      .toEqual({ ok: false, reason: `key-unresolvable: ${outgoing} is unknown or revoked` })
    expect(await resolveVerificationKey('0123456789abcdef'))
      .toEqual({ ok: false, reason: 'key-unresolvable: 0123456789abcdef is unknown or revoked' })
    expect(keyFileReads()).toEqual([])
  })

  it('VFY-1: core reads a key file once', async () => {
    const current = await bootstrapped()
    const { loadSubordinateKey } = await import('./subordinateKey.server')
    const { publicKey } = await loadSubordinateKey(current) as { publicKey: Uint8Array }
    const { resolveVerificationKey } = await resolution()

    const resolutions = await Promise.all([1, 2, 3].map(async () => await resolveVerificationKey(current)))

    expect(resolutions).toEqual(Array(3).fill({ ok: true, key: { alg: SUBORDINATE_ALGORITHM, publicKey } }))
    expect(keyFileReads()).toEqual([`read ${keyFilePathOf(current)}`])
  })

  it('VFY-1: core reports an absent key file as a verdict', async () => {
    const current = await bootstrapped()
    await removeStored(keyFilePathOf(current))
    const { resolveVerificationKey } = await resolution()

    expect(await resolveVerificationKey(current)).toEqual({ ok: false, reason: `key-file-absent: ${current}` })
  })
})
