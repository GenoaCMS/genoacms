import { describe, it, expect } from 'vitest'
import {
  parseKeyManifest,
  digestOf,
  findKey,
  isRevoked,
  currentKey,
  withRotatedKey,
  withRevokedKey,
  type KeyManifest,
  type RegisteredKey
} from './registry'
import { getAlgorithm, SUBORDINATE_ALGORITHM } from './algorithms'
import { deriveKeyId } from './keyId'
import { toBase64 } from './envelope'

const algorithm = getAlgorithm(SUBORDINATE_ALGORITHM)

const keypairOf = (fill: number) => algorithm.generateKeypair(new Uint8Array(algorithm.lengths.seed).fill(fill))

const entryOf = (fill: number, createdAt: number): RegisteredKey => {
  const { publicKey } = keypairOf(fill)
  return { keyId: deriveKeyId(publicKey), alg: SUBORDINATE_ALGORITHM, digest: digestOf(publicKey), createdAt }
}

const first = (): RegisteredKey => entryOf(1, 1_000)
const second = (): RegisteredKey => entryOf(2, 2_000)
const third = (): RegisteredKey => entryOf(3, 3_000)

const manifestOf = (...keys: RegisteredKey[]): KeyManifest => ({ sequence: 1, current: keys[keys.length - 1].keyId, keys })

const parsed = (payload: unknown): KeyManifest => {
  const result = parseKeyManifest(payload)
  if (!result.ok) throw new Error(result.reason)
  return result.manifest
}

const refusal = (payload: unknown) => parseKeyManifest(payload)

describe('the key manifest', () => {
  it('REG-1: accepts a manifest of one current key', () => {
    const manifest = manifestOf(first())
    expect(parseKeyManifest(structuredClone(manifest))).toEqual({ ok: true, manifest })
  })

  it('REG-1: refuses a v1 entry that still carries its public key', () => {
    const entry = { ...first(), publicKey: toBase64(keypairOf(1).publicKey) }
    expect(refusal({ sequence: 1, current: entry.keyId, keys: [entry] }))
      .toEqual({ ok: false, reason: 'keys[0] has unexpected fields: publicKey' })
  })

  it('REG-1: refuses a digest that is not 64 lowercase hexadecimal characters', () => {
    const entry = first()
    for (const digest of [entry.digest.slice(0, 63), `${entry.digest}0`, entry.digest.toUpperCase()]) {
      expect(refusal({ sequence: 1, current: entry.keyId, keys: [{ ...entry, digest }] }))
        .toEqual({ ok: false, reason: 'keys[0].digest is not 64 lowercase hexadecimal characters' })
    }
  })

  it('REG-1: refuses a key id that is not the beginning of the digest', () => {
    const entry = { ...first(), digest: second().digest }
    expect(refusal({ sequence: 1, current: entry.keyId, keys: [entry] }))
      .toEqual({ ok: false, reason: 'keys[0].digest does not begin with its keyId' })
  })

  it('REG-1: refuses any algorithm but ML-DSA-65', () => {
    const entry = { ...first(), alg: 'SLH-DSA-SHA2-128s' }
    expect(refusal({ sequence: 1, current: entry.keyId, keys: [entry] }))
      .toEqual({ ok: false, reason: 'keys[0].alg must be ML-DSA-65, not SLH-DSA-SHA2-128s' })
  })

  it('REG-1: refuses null for an unset moment', () => {
    const entry = first()
    expect(refusal({ sequence: 1, current: entry.keyId, keys: [{ ...entry, supersededAt: null }] }))
      .toEqual({ ok: false, reason: 'keys[0].supersededAt must be a timestamp or omitted' })
    expect(refusal({ sequence: 1, current: entry.keyId, keys: [{ ...entry, revokedAt: null }] }))
      .toEqual({ ok: false, reason: 'keys[0].revokedAt must be a timestamp or omitted' })
  })

  it('REG-1: refuses an empty key list', () => {
    expect(refusal({ sequence: 1, current: first().keyId, keys: [] }))
      .toEqual({ ok: false, reason: 'registry.keys is empty' })
  })

  it('REG-1: refuses a key listed twice', () => {
    const entry = first()
    expect(refusal({ sequence: 1, current: entry.keyId, keys: [entry, entry] }))
      .toEqual({ ok: false, reason: `registry lists ${entry.keyId} twice` })
  })

  it('REG-1: refuses a current key that is superseded or revoked', () => {
    const entry = first()
    expect(refusal({ sequence: 1, current: entry.keyId, keys: [{ ...entry, supersededAt: 5_000 }] }))
      .toEqual({ ok: false, reason: `registry.current ${entry.keyId} is marked superseded` })
    expect(refusal({ sequence: 1, current: entry.keyId, keys: [{ ...entry, revokedAt: 5_000 }] }))
      .toEqual({ ok: false, reason: `registry.current ${entry.keyId} is revoked` })
  })

  it('REG-1: refuses a sequence below 1', () => {
    const entry = first()
    for (const sequence of [0, -1]) {
      expect(refusal({ sequence, current: entry.keyId, keys: [entry] }))
        .toEqual({ ok: false, reason: 'registry.sequence is not a positive integer' })
    }
  })

  it('REG-1: refuses an unexpected member of the manifest', () => {
    expect(refusal({ ...manifestOf(first()), rootOverride: 'x' }))
      .toEqual({ ok: false, reason: 'registry has unexpected fields: rootOverride' })
  })
})

describe('changing the key manifest', () => {
  it('REG-1: a rotation supersedes the current key and keeps every entry', () => {
    const once = withRotatedKey(parsed(manifestOf(first())), second(), 2_000)

    expect(once.current).toBe(second().keyId)
    expect(once.sequence).toBe(2)
    expect(once.keys).toHaveLength(2)
    expect(findKey(once, first().keyId)?.supersededAt).toBe(2_000)
    expect(findKey(once, second().keyId)).not.toHaveProperty('supersededAt')
    expect(currentKey(once).keyId).toBe(second().keyId)
    expect(parseKeyManifest(JSON.parse(JSON.stringify(once))).ok).toBe(true)

    const twice = withRotatedKey(once, third(), 3_000)
    expect(findKey(twice, first().keyId)?.supersededAt).toBe(2_000)
    expect(findKey(twice, second().keyId)?.supersededAt).toBe(3_000)
    expect(twice.keys.map(entry => entry.keyId)).toEqual([first().keyId, second().keyId, third().keyId])
  })

  it('REG-1: a revocation keeps the entry and refuses the current key', () => {
    const rotated = withRotatedKey(parsed(manifestOf(first())), second(), 2_000)
    const revoked = withRevokedKey(rotated, first().keyId, 3_000)

    expect(revoked.sequence).toBe(3)
    expect(revoked.keys).toHaveLength(2)
    expect(findKey(revoked, first().keyId)?.revokedAt).toBe(3_000)
    expect(isRevoked(findKey(revoked, first().keyId) as RegisteredKey)).toBe(true)
    expect(isRevoked(findKey(revoked, second().keyId) as RegisteredKey)).toBe(false)
    expect(parseKeyManifest(JSON.parse(JSON.stringify(revoked))).ok).toBe(true)
    expect(findKey(withRevokedKey(revoked, first().keyId, 9_000), first().keyId)?.revokedAt).toBe(3_000)

    expect(() => withRevokedKey(revoked, second().keyId, 4_000)).toThrow(/cannot-revoke-current/)
    expect(() => withRevokedKey(revoked, 'deadbeefdeadbeef', 4_000)).toThrow(/unknown-key/)
  })
})
