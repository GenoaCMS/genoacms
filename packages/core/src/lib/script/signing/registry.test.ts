import { describe, it, expect } from 'vitest'
import {
  parseKeyRegistry,
  findKey,
  findPublicKey,
  currentKey,
  withRotatedKey,
  type KeyRegistry
} from './registry'
import { getAlgorithm, SUBORDINATE_ALGORITHM, ROOT_ALGORITHM } from './algorithms'
import { deriveKeyId } from './keyId'
import { toBase64 } from './envelope'

const algorithm = getAlgorithm(SUBORDINATE_ALGORITHM)

/** A real keypair, so keyId genuinely derives from publicKey. */
const makeEntry = (fill: number, createdAt = 1_000) => {
  const keypair = algorithm.generateKeypair(new Uint8Array(algorithm.lengths.seed).fill(fill))
  return {
    keyId: deriveKeyId(keypair.publicKey),
    alg: SUBORDINATE_ALGORITHM,
    publicKey: toBase64(keypair.publicKey),
    createdAt,
    keypair
  }
}

const first = makeEntry(1, 1_000)
const second = makeEntry(2, 2_000)

const entry = ({ keypair: _k, ...rest }: ReturnType<typeof makeEntry>) => rest

const validRegistry = (): unknown => ({ current: first.keyId, keys: [entry(first)] })

describe('a valid registry', () => {
  it('parses', () => {
    const result = parseKeyRegistry(validRegistry())
    expect(result.ok).toBe(true)
  })

  it('accepts a superseded key alongside the current one', () => {
    const result = parseKeyRegistry({
      current: second.keyId,
      keys: [{ ...entry(first), supersededAt: 2_000 }, entry(second)]
    })
    expect(result.ok).toBe(true)
  })

  it('finds a key and decodes its public key', () => {
    const result = parseKeyRegistry(validRegistry())
    if (!result.ok) throw new Error(result.reason)
    expect(findKey(result.registry, first.keyId)?.keyId).toBe(first.keyId)
    expect(Array.from(findPublicKey(result.registry, first.keyId) ?? []))
      .toEqual(Array.from(first.keypair.publicKey))
  })

  it('returns nothing for a key it does not list', () => {
    const result = parseKeyRegistry(validRegistry())
    if (!result.ok) throw new Error(result.reason)
    expect(findPublicKey(result.registry, second.keyId)).toBeUndefined()
  })

  it('reports the current entry', () => {
    const result = parseKeyRegistry(validRegistry())
    if (!result.ok) throw new Error(result.reason)
    expect(currentKey(result.registry).keyId).toBe(first.keyId)
  })
})

describe('entries that must be rejected', () => {
  const rejects = (payload: unknown, pattern: RegExp): void => {
    const result = parseKeyRegistry(payload)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toMatch(pattern)
  }

  it('rejects a keyId that does not derive from its public key', () => {
    // The substitution this check exists for: an attacker's key published under an id that existing
    // signed artifacts already reference.
    rejects({ current: first.keyId, keys: [{ ...entry(first), publicKey: second.publicKey }] },
      /does not derive/)
  })

  it('rejects a public key of the wrong size for its algorithm', () => {
    rejects({ current: first.keyId, keys: [{ ...entry(first), publicKey: toBase64(new Uint8Array(10)) }] },
      /expected 1952|does not derive/)
  })

  it('rejects a public key that is not base64', () => {
    rejects({ current: first.keyId, keys: [{ ...entry(first), publicKey: 'not base64!!' }] }, /not base64/)
  })

  it('rejects an unknown algorithm', () => {
    rejects({ current: first.keyId, keys: [{ ...entry(first), alg: 'RSA-2048' }] }, /not a known algorithm/)
  })

  it('rejects a current key that is marked superseded', () => {
    // A key cannot both be the one to sign with and one that has stopped signing.
    rejects({ current: first.keyId, keys: [{ ...entry(first), supersededAt: 5_000 }] }, /marked superseded/)
  })

  it('rejects a current key that is not listed', () => {
    rejects({ current: second.keyId, keys: [entry(first)] }, /not among its keys/)
  })

  it('rejects a duplicated keyId', () => {
    rejects({ current: first.keyId, keys: [entry(first), entry(first)] }, /twice/)
  })

  it('rejects null supersededAt rather than treating it as omitted', () => {
    // §3.6.3: omitted and null are different documents with different digests.
    rejects({ current: first.keyId, keys: [{ ...entry(first), supersededAt: null }] }, /supersededAt/)
  })

  it('rejects unexpected fields on an entry', () => {
    rejects({ current: first.keyId, keys: [{ ...entry(first), trusted: true }] }, /unexpected fields/)
  })

  it('rejects unexpected fields on the registry', () => {
    rejects({ ...(validRegistry() as object), rootOverride: 'x' }, /unexpected fields/)
  })

  it('rejects an empty key list', () => {
    rejects({ current: first.keyId, keys: [] }, /empty/)
  })

  it.each([null, 'a string', 42, []])('rejects the non-registry value %s', (payload) => {
    expect(parseKeyRegistry(payload).ok).toBe(false)
  })

  it('fails whole when one entry of several is bad', () => {
    // Keeping the entries that happen to validate would let whoever corrupted one choose which
    // keys survive.
    rejects({ current: first.keyId, keys: [entry(first), { ...entry(second), publicKey: 'nope!' }] },
      /keys\[1\]/)
  })

  it('rejects a non-integer timestamp', () => {
    rejects({ current: first.keyId, keys: [{ ...entry(first), createdAt: 'yesterday' }] }, /createdAt/)
  })
})

describe('rotation', () => {
  const base = (): KeyRegistry => {
    const result = parseKeyRegistry(validRegistry())
    if (!result.ok) throw new Error(result.reason)
    return result.registry
  }

  it('makes the new key current', () => {
    const rotated = withRotatedKey(base(), entry(second), 2_000)
    expect(rotated.current).toBe(second.keyId)
  })

  it('retains the outgoing key so its signatures still verify', () => {
    const rotated = withRotatedKey(base(), entry(second), 2_000)
    expect(findKey(rotated, first.keyId)).toBeDefined()
    expect(rotated.keys).toHaveLength(2)
  })

  it('marks the outgoing key superseded at the rotation time', () => {
    const rotated = withRotatedKey(base(), entry(second), 2_000)
    expect(findKey(rotated, first.keyId)?.supersededAt).toBe(2_000)
  })

  it('leaves the incoming key without a supersededAt', () => {
    const rotated = withRotatedKey(base(), entry(second), 2_000)
    expect(findKey(rotated, second.keyId)).not.toHaveProperty('supersededAt')
  })

  it('produces a registry that still parses', () => {
    const rotated = withRotatedKey(base(), entry(second), 2_000)
    expect(parseKeyRegistry(JSON.parse(JSON.stringify(rotated))).ok).toBe(true)
  })

  it('does not re-supersede a key that was already superseded', () => {
    const third = makeEntry(3, 3_000)
    const once = withRotatedKey(base(), entry(second), 2_000)
    const twice = withRotatedKey(once, entry(third), 3_000)
    expect(findKey(twice, first.keyId)?.supersededAt).toBe(2_000)
    expect(findKey(twice, second.keyId)?.supersededAt).toBe(3_000)
  })
})

describe('algorithm agility', () => {
  it('records the algorithm per key, so a registry can hold keys of two algorithms', () => {
    // What lets the subordinate algorithm change without invalidating keys issued under the old one.
    const rootAlg = getAlgorithm(ROOT_ALGORITHM)
    const legacy = rootAlg.generateKeypair(new Uint8Array(rootAlg.lengths.seed).fill(9))
    const result = parseKeyRegistry({
      current: first.keyId,
      keys: [
        { keyId: deriveKeyId(legacy.publicKey), alg: ROOT_ALGORITHM, publicKey: toBase64(legacy.publicKey), createdAt: 1, supersededAt: 2 },
        entry(first)
      ]
    })
    expect(result.ok).toBe(true)
  })
})
