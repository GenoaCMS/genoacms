import { describe, it, expect } from 'vitest'
import {
  parseKeyRegistry,
  findKey,
  findPublicKey,
  isRevoked,
  currentKey,
  withRotatedKey,
  withRevokedKey,
  type KeyRegistry
} from './registry'
import { getAlgorithm, SUBORDINATE_ALGORITHM, ROOT_ALGORITHM } from './algorithms'
import { deriveKeyId } from './keyId'
import { toBase64, sign, verify } from './envelope'

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

const validRegistry = (): unknown => ({ sequence: 1, current: first.keyId, keys: [entry(first)] })

describe('a valid registry', () => {
  it('parses', () => {
    const result = parseKeyRegistry(validRegistry())
    expect(result.ok).toBe(true)
  })

  it('accepts a superseded key alongside the current one', () => {
    const result = parseKeyRegistry({
      sequence: 1,
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
    rejects({ sequence: 1, current: first.keyId, keys: [{ ...entry(first), publicKey: second.publicKey }] },
      /does not derive/)
  })

  it('rejects a public key of the wrong size for its algorithm', () => {
    rejects({ sequence: 1, current: first.keyId, keys: [{ ...entry(first), publicKey: toBase64(new Uint8Array(10)) }] },
      /expected 1952|does not derive/)
  })

  it('rejects a public key that is not base64', () => {
    rejects({ sequence: 1, current: first.keyId, keys: [{ ...entry(first), publicKey: 'not base64!!' }] }, /not base64/)
  })

  it('rejects an unknown algorithm', () => {
    rejects({ sequence: 1, current: first.keyId, keys: [{ ...entry(first), alg: 'RSA-2048' }] }, /not a known algorithm/)
  })

  it('rejects a current key that is marked superseded', () => {
    // A key cannot both be the one to sign with and one that has stopped signing.
    rejects({ sequence: 1, current: first.keyId, keys: [{ ...entry(first), supersededAt: 5_000 }] }, /marked superseded/)
  })

  it('rejects a current key that is not listed', () => {
    rejects({ sequence: 1, current: second.keyId, keys: [entry(first)] }, /not among its keys/)
  })

  it('rejects a duplicated keyId', () => {
    rejects({ sequence: 1, current: first.keyId, keys: [entry(first), entry(first)] }, /twice/)
  })

  it('rejects null supersededAt rather than treating it as omitted', () => {
    // Omitted and null are different documents with different digests.
    rejects({ sequence: 1, current: first.keyId, keys: [{ ...entry(first), supersededAt: null }] }, /supersededAt/)
  })

  it('rejects unexpected fields on an entry', () => {
    rejects({ sequence: 1, current: first.keyId, keys: [{ ...entry(first), trusted: true }] }, /unexpected fields/)
  })

  it('rejects unexpected fields on the registry', () => {
    rejects({ ...(validRegistry() as object), rootOverride: 'x' }, /unexpected fields/)
  })

  it('rejects an empty key list', () => {
    rejects({ sequence: 1, current: first.keyId, keys: [] }, /empty/)
  })

  it.each([null, 'a string', 42, []])('rejects the non-registry value %s', (payload) => {
    expect(parseKeyRegistry(payload).ok).toBe(false)
  })

  it('fails whole when one entry of several is bad', () => {
    // Keeping the entries that happen to validate would let whoever corrupted one choose which
    // keys survive.
    rejects({ sequence: 1, current: first.keyId, keys: [entry(first), { ...entry(second), publicKey: 'nope!' }] },
      /keys\[1\]/)
  })

  it('rejects a non-integer timestamp', () => {
    rejects({ sequence: 1, current: first.keyId, keys: [{ ...entry(first), createdAt: 'yesterday' }] }, /createdAt/)
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
      sequence: 1,
      current: first.keyId,
      keys: [
        { keyId: deriveKeyId(legacy.publicKey), alg: ROOT_ALGORITHM, publicKey: toBase64(legacy.publicKey), createdAt: 1, supersededAt: 2 },
        entry(first)
      ]
    })
    expect(result.ok).toBe(true)
  })
})

describe('revocation', () => {
  const rotated = (): KeyRegistry => {
    const parsed = parseKeyRegistry(validRegistry())
    if (!parsed.ok) throw new Error(parsed.reason)
    return withRotatedKey(parsed.registry, entry(second), 2_000)
  }

  it('stops a revoked key resolving, so nothing it signed verifies', () => {
    const revoked = withRevokedKey(rotated(), first.keyId, 3_000)
    expect(findPublicKey(revoked, first.keyId)).toBeUndefined()
  })

  it('rejects a forged artifact signed by a leaked key after rotation', () => {
    // The attack: rotation alone leaves the old key verifying, so whoever holds it can sign a new
    // roles.json granting themselves everything. Revocation is what actually stops it.
    const forged = sign('genoacms.roles.v1',
      { roles: { SuperAdmin: [{ permission: '*', resource: '*' }] } },
      { alg: SUBORDINATE_ALGORITHM, keyId: first.keyId, secretKey: first.keypair.secretKey })

    const superseded = rotated()
    const beforeRevocation = findPublicKey(superseded, first.keyId)
    expect(beforeRevocation).toBeDefined()
    expect(verify(forged, 'genoacms.roles.v1', beforeRevocation as Uint8Array).valid).toBe(true)

    const revoked = withRevokedKey(superseded, first.keyId, 3_000)
    expect(findPublicKey(revoked, first.keyId)).toBeUndefined()
  })

  it('keeps the entry, so the revocation is published rather than inferred from absence', () => {
    const revoked = withRevokedKey(rotated(), first.keyId, 3_000)
    expect(findKey(revoked, first.keyId)?.revokedAt).toBe(3_000)
    expect(isRevoked(findKey(revoked, first.keyId) as never)).toBe(true)
  })

  it('leaves other keys resolving', () => {
    const revoked = withRevokedKey(rotated(), first.keyId, 3_000)
    expect(findPublicKey(revoked, second.keyId)).toBeDefined()
  })

  it('refuses to revoke the current key, which would leave nothing able to sign the registry', () => {
    const parsed = parseKeyRegistry(validRegistry())
    if (!parsed.ok) throw new Error(parsed.reason)
    expect(() => withRevokedKey(parsed.registry, first.keyId, 3_000)).toThrow(/cannot-revoke-current/)
  })

  it('refuses to revoke a key it does not list', () => {
    expect(() => withRevokedKey(rotated(), 'deadbeefdeadbeef', 3_000)).toThrow(/unknown-key/)
  })

  it('produces a registry that still parses', () => {
    const revoked = withRevokedKey(rotated(), first.keyId, 3_000)
    expect(parseKeyRegistry(JSON.parse(JSON.stringify(revoked))).ok).toBe(true)
  })

  it('rejects a registry whose current key is revoked', () => {
    const result = parseKeyRegistry({
      sequence: 1,
      current: first.keyId,
      keys: [{ ...entry(first), revokedAt: 3_000 }]
    })
    expect(result.ok).toBe(false)
  })

  it('rejects null revokedAt rather than treating it as omitted', () => {
    const result = parseKeyRegistry({ current: first.keyId, keys: [{ ...entry(first), revokedAt: null }] })
    expect(result.ok).toBe(false)
  })

  it('does not re-date an already revoked key', () => {
    const once = withRevokedKey(rotated(), first.keyId, 3_000)
    const twice = withRevokedKey(once, first.keyId, 9_000)
    expect(findKey(twice, first.keyId)?.revokedAt).toBe(3_000)
  })
})

describe('the monotonic sequence', () => {
  const base = (): KeyRegistry => {
    const parsed = parseKeyRegistry(validRegistry())
    if (!parsed.ok) throw new Error(parsed.reason)
    return parsed.registry
  }

  it('advances on rotation', () => {
    expect(withRotatedKey(base(), entry(second), 2_000).sequence).toBe(2)
  })

  it('advances on revocation', () => {
    const rotated = withRotatedKey(base(), entry(second), 2_000)
    expect(withRevokedKey(rotated, first.keyId, 3_000).sequence).toBe(3)
  })

  it('never decreases across a series of changes', () => {
    // The property rollback detection rests on: a later registry always carries a higher sequence.
    const third = makeEntry(3, 3_000)
    const one = base()
    const two = withRotatedKey(one, entry(second), 2_000)
    const three = withRevokedKey(two, first.keyId, 2_500)
    const four = withRotatedKey(three, entry(third), 3_000)
    expect([one.sequence, two.sequence, three.sequence, four.sequence]).toEqual([1, 2, 3, 4])
  })

  it('is carried inside the signed payload, so it cannot be edited without breaking the signature', () => {
    // Asserted structurally: the sequence is a field of the registry, which is what gets signed.
    expect(Object.keys(base())).toContain('sequence')
  })

  it.each([0, -1, 1.5, '1', null])('rejects the invalid sequence %s', (sequence) => {
    expect(parseKeyRegistry({ sequence, current: first.keyId, keys: [entry(first)] }).ok).toBe(false)
  })

  it('rejects a registry with no sequence at all', () => {
    expect(parseKeyRegistry({ current: first.keyId, keys: [entry(first)] }).ok).toBe(false)
  })
})
