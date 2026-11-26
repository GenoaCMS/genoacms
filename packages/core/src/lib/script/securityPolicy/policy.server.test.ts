import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { memory } from '#lib/script/testing/memoryStorage.js'
import { memorySecrets } from '#lib/script/testing/memorySecrets.js'
import { ROOT_SEED_SECRET, testRoot, testRootSeed, rootSigned } from '#lib/script/testing/keyManifests.js'
import { getAlgorithm, ROOT_ALGORITHM } from '#lib/script/signing/algorithms.js'
import { deriveKeyId } from '#lib/script/signing/keyId.js'
import { sign, toBase64, verify, type DocumentType } from '#lib/script/signing/envelope.js'
import type { JsonValue } from '#lib/script/signing/canonical.js'

vi.setConfig({ testTimeout: 60_000 })

const recorded = vi.hoisted(() => ({
  log: [] as string[],
  failRead: undefined as undefined | Error
}))

vi.mock('#lib/script/storage/providers.server.js', async () => {
  const { memoryProviders } = await import('#lib/script/testing/memoryStorage.js')
  type Reference = Parameters<typeof memoryProviders.getObject>[0]
  return {
    ...memoryProviders,
    getObject: async (reference: Reference) => {
      if (recorded.failRead !== undefined) throw recorded.failRead
      return await memoryProviders.getObject(reference)
    },
    uploadObject: async (reference: Reference, data: unknown, options: unknown) => {
      await memoryProviders.uploadObject(reference, data as never, options as never)
      recorded.log.push(`write ${reference.name}`)
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
    }
  }
})

const policyServer = async () => await import('./policy.server')

const POLICY_PATH = '.genoacms/security/policy.json'
const POLICY_V2 = 'genoacms.securityPolicy.v2'
const MARK = 'GENOACMS_SECURITY_POLICY_SEQUENCE'

const CONFIGURED = {
  subordinateKeyRotationDays: 90,
  accessTokenMinutes: 15,
  grantCacheSeconds: 30,
  refreshTokenDays: 14,
  maxFuel: 1_000_000,
  maxDepth: 100,
  maxAllocation: 10_000_000,
  fetchOrigins: [] as string[]
}

const rootAlgorithm = getAlgorithm(ROOT_ALGORITHM)
const otherRoot = rootAlgorithm.generateKeypair(new Uint8Array(rootAlgorithm.lengths.seed).fill(9))

const policyText = (payload: Record<string, unknown>, type = POLICY_V2): string =>
  JSON.stringify(rootSigned(type, payload as unknown as JsonValue))

const policyAt = (sequence: number, over: Record<string, unknown> = {}): string =>
  policyText({ ...CONFIGURED, ...over, sequence })

const signedByOtherRoot = (): string =>
  JSON.stringify(sign(POLICY_V2 as DocumentType, { ...CONFIGURED, sequence: 1 } as unknown as JsonValue, {
    alg: ROOT_ALGORITHM, keyId: deriveKeyId(otherRoot.publicKey), secretKey: otherRoot.secretKey
  }))

const writes = (): string[] => recorded.log.filter(event => event.startsWith('write ') || event.startsWith(`secret ${MARK}=`))

const storedPayload = (): Record<string, unknown> => memory.json(POLICY_PATH).payload

const resetInstance = (): void => {
  memory.clear()
  memorySecrets.clear()
  memorySecrets.set(ROOT_SEED_SECRET, toBase64(testRootSeed))
  recorded.log.length = 0
  recorded.failRead = undefined
}

beforeEach(() => {
  vi.resetModules()
  resetInstance()
  vi.spyOn(console, 'warn').mockImplementation(() => undefined)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('creating the policy', () => {
  it('POL-1: an absent policy is created from the configuration with sequence 1', async () => {
    const { readStoredPolicy } = await policyServer()

    const stored = await readStoredPolicy()

    expect(stored).toMatchObject({ state: 'trusted', policy: { ...CONFIGURED, sequence: 1 } })
    expect(memory.json(POLICY_PATH).type).toBe(POLICY_V2)
    expect(verify(memory.json(POLICY_PATH), POLICY_V2 as DocumentType, { alg: ROOT_ALGORITHM, publicKey: testRoot.publicKey }))
      .toEqual({ valid: true, payload: { ...CONFIGURED, sequence: 1 } })
    expect(memorySecrets.get(MARK)).toBe('1')
  })

  it('POL-1, POL-3: a deleted policy is damaged, not recreated, once a mark exists', async () => {
    memorySecrets.set(MARK, '3')
    const { readStoredPolicy } = await policyServer()

    expect(await readStoredPolicy())
      .toMatchObject({ state: 'damaged', reason: 'policy-absent: nothing is stored, but the mark is 3' })
    expect(memory.has(POLICY_PATH)).toBe(false)
    expect(writes()).toEqual([])
    expect(memorySecrets.get(MARK)).toBe('3')
  })

  it('POL-1, YF8: a failed read propagates and creates nothing', async () => {
    const failure = new Error('storage unreachable')
    recorded.failRead = failure
    const { readStoredPolicy } = await policyServer()

    await expect(readStoredPolicy()).rejects.toBe(failure)
    expect(memory.has(POLICY_PATH)).toBe(false)
    expect(writes()).toEqual([])
  })
})

describe('the sequence and its mark', () => {
  it('POL-2: each write raises the sequence by one and records the mark after the policy', async () => {
    memory.set(POLICY_PATH, policyAt(4))
    memorySecrets.set(MARK, '4')
    const { readStoredPolicy, writePolicy } = await policyServer()
    const stored = await readStoredPolicy()
    expect(stored.state).toBe('trusted')
    recorded.log.length = 0

    const written = await writePolicy({ ...CONFIGURED, maxDepth: 50 }, stored)

    expect(written).toEqual({ ...CONFIGURED, maxDepth: 50, sequence: 5 })
    expect(storedPayload()).toEqual({ ...CONFIGURED, maxDepth: 50, sequence: 5 })
    expect(writes()).toEqual([`write ${POLICY_PATH}`, `secret ${MARK}=5`])
    expect(memorySecrets.get(MARK)).toBe('5')
  })

  it('POL-2: a write after a rollback continues above the mark', async () => {
    memory.set(POLICY_PATH, policyAt(3))
    memorySecrets.set(MARK, '5')
    const { readStoredPolicy, writePolicy } = await policyServer()
    const stored = await readStoredPolicy()

    const written = await writePolicy(CONFIGURED, stored)

    expect(written.sequence).toBe(6)
    expect(storedPayload().sequence).toBe(6)
    expect(memorySecrets.get(MARK)).toBe('6')
  })

  it('POL-2, POL-3, YF3: a policy below the mark is damaged', async () => {
    const older = policyAt(3, { accessTokenMinutes: 1_440 })
    memory.set(POLICY_PATH, policyAt(4))
    memorySecrets.set(MARK, '4')
    memory.set(POLICY_PATH, older)
    const { readStoredPolicy } = await policyServer()

    expect(await readStoredPolicy())
      .toMatchObject({ state: 'damaged', reason: 'policy-rollback: sequence 3 is below the highest seen (4)' })
    expect(memory.text(POLICY_PATH)).toBe(older)
    expect(memorySecrets.get(MARK)).toBe('4')
  })

  it('POL-2: a policy above the mark raises it', async () => {
    memorySecrets.set(MARK, '2')
    memory.set(POLICY_PATH, policyAt(3))
    const { readStoredPolicy } = await policyServer()

    expect(await readStoredPolicy()).toMatchObject({ state: 'trusted', policy: { ...CONFIGURED, sequence: 3 } })
    expect(memorySecrets.get(MARK)).toBe('3')
  })
})

describe('a damaged policy', () => {
  it('POL-3, YF4: each kind of damage is reported, and the document is left in place', async () => {
    const kinds: Array<{ text: string, mark?: string, reason: unknown }> = [
      { text: 'not json {', reason: 'not JSON' },
      { text: signedByOtherRoot(), reason: expect.stringMatching(/^signature: /) },
      {
        text: policyText(CONFIGURED, 'genoacms.securityPolicy.v1'),
        reason: 'policy-needs-migration: the stored policy is genoacms.securityPolicy.v1, which this version of core does not read'
      },
      { text: policyAt(1, { maxDepth: 1 }), reason: 'policy.maxDepth must be between 8 and 10000' },
      { text: policyAt(1), mark: 'x', reason: `policy-sequence/unreadable: ${MARK} is 'x'` }
    ]

    for (const kind of kinds) {
      vi.resetModules()
      resetInstance()
      memory.set(POLICY_PATH, kind.text)
      if (kind.mark !== undefined) memorySecrets.set(MARK, kind.mark)
      const { readStoredPolicy } = await policyServer()

      expect(await readStoredPolicy()).toMatchObject({ state: 'damaged', reason: kind.reason })
      expect(memory.text(POLICY_PATH)).toBe(kind.text)
      expect(writes()).toEqual([])
    }
  })

  it('POL-3, YF4: a damaged policy gives the strictest access values', async () => {
    memory.set(POLICY_PATH, 'not json {')
    const { accessPolicy } = await policyServer()

    expect(await accessPolicy()).toEqual({ accessTokenMinutes: 1, refreshTokenDays: 1, grantCacheSeconds: 0 })
  })

  it('POL-3: a damaged policy governs nothing else', async () => {
    memory.set(POLICY_PATH, 'not json {')
    const { governingPolicy } = await policyServer()

    expect(await governingPolicy()).toEqual({ ok: false, reason: 'not JSON' })
  })
})
