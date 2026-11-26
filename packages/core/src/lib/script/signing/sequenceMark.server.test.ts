import { describe, it, expect, vi, beforeEach } from 'vitest'
import { memorySecrets } from '#lib/script/testing/memorySecrets.js'
import { REGISTRY_SEQUENCE_SECRET, POLICY_SEQUENCE_SECRET } from './secretNames'

vi.mock('#lib/script/secrets/providers.server.js', async () => (await import('#lib/script/testing/memorySecrets.js')).memorySecretsProviders)

const marks = async () => await import('./sequenceMark.server')
const registrySequence = async () => await import('./registrySequence.server')

const REGISTRY_MARK = 'GENOACMS_KEY_REGISTRY_SEQUENCE'
const POLICY_MARK = 'GENOACMS_SECURITY_POLICY_SEQUENCE'

const registryUnreadable = (value: string): string => `registry-sequence/unreadable: ${REGISTRY_MARK} is '${value}'`
const policyUnreadable = (value: string): string => `policy-sequence/unreadable: ${POLICY_MARK} is '${value}'`

beforeEach(() => {
  vi.resetModules()
  memorySecrets.clear()
})

describe('the marks', () => {
  it('REG-4, POL-2: each mark is its own secret', async () => {
    const { readMark, checkAndAdvanceMark, recordMark } = await marks()

    await recordMark(POLICY_SEQUENCE_SECRET, 3, policyUnreadable)
    expect(memorySecrets.get(POLICY_MARK)).toBe('3')
    expect(memorySecrets.get(REGISTRY_MARK)).toBeUndefined()

    expect(await checkAndAdvanceMark(REGISTRY_SEQUENCE_SECRET, 5, registryUnreadable)).toEqual({ ok: true, advanced: true })
    expect(memorySecrets.get(REGISTRY_MARK)).toBe('5')
    expect(memorySecrets.get(POLICY_MARK)).toBe('3')

    expect(await readMark(POLICY_SEQUENCE_SECRET, policyUnreadable)).toBe(3)
    expect(await readMark(REGISTRY_SEQUENCE_SECRET, registryUnreadable)).toBe(5)
    expect(await checkAndAdvanceMark(POLICY_SEQUENCE_SECRET, 2, policyUnreadable)).toEqual({ ok: false, seen: 2, mark: 3 })
  })

  it('REG-4, POL-2: a mark of another form names its own secret', async () => {
    memorySecrets.set(REGISTRY_MARK, 'x')
    memorySecrets.set(POLICY_MARK, '05')
    const { readMark, checkAndAdvanceMark, recordMark } = await marks()
    const registryMessage = registryUnreadable('x')
    const policyMessage = policyUnreadable('05')

    await expect(readMark(REGISTRY_SEQUENCE_SECRET, registryUnreadable)).rejects.toMatchObject({ message: registryMessage })
    await expect(checkAndAdvanceMark(REGISTRY_SEQUENCE_SECRET, 1, registryUnreadable)).rejects.toMatchObject({ message: registryMessage })
    await expect(recordMark(REGISTRY_SEQUENCE_SECRET, 1, registryUnreadable)).rejects.toMatchObject({ message: registryMessage })

    await expect(readMark(POLICY_SEQUENCE_SECRET, policyUnreadable)).rejects.toMatchObject({ message: policyMessage })
    await expect(checkAndAdvanceMark(POLICY_SEQUENCE_SECRET, 1, policyUnreadable)).rejects.toMatchObject({ message: policyMessage })
    await expect(recordMark(POLICY_SEQUENCE_SECRET, 1, policyUnreadable)).rejects.toMatchObject({ message: policyMessage })

    await expect((await registrySequence()).readHighWaterMark()).rejects.toMatchObject({ message: registryMessage })
    expect(memorySecrets.get(REGISTRY_MARK)).toBe('x')
    expect(memorySecrets.get(POLICY_MARK)).toBe('05')
  })
})
