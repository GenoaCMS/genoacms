import { describe, it, expect } from 'vitest'
import { SUBORDINATE_SEED_PREFIX, subordinateSeedSecret } from './secretNames'
import { getAlgorithm, SUBORDINATE_ALGORITHM } from './algorithms'
import { deriveKeyId } from './keyId'
import { isValidSecretKey } from '@genoacms/cloudabstraction/secrets'
import { sign, verify, toBase64, type SigningKey } from './envelope'

const algorithm = getAlgorithm(SUBORDINATE_ALGORITHM)

/** Mirrors what `createSubordinateKey` does, minus the storage call. */
const keyFromSeed = (seed: Uint8Array) => {
  const keypair = algorithm.generateKeypair(seed)
  return { keypair, keyId: deriveKeyId(keypair.publicKey) }
}

describe('seed secret naming', () => {
  it('names a key by its derived id', () => {
    expect(subordinateSeedSecret('9f2c41ab8d7e0355')).toBe(`${SUBORDINATE_SEED_PREFIX}9f2c41ab8d7e0355`)
  })

  it('produces a name the secrets service will accept', () => {
    // The portable key rule is [A-Za-z_][A-Za-z0-9_]* — a prefix plus hex has to satisfy it, or
    // subordinate keys would work against one secret store and be rejected by another.
    const { keyId } = keyFromSeed(new Uint8Array(algorithm.lengths.seed).fill(3))
    expect(isValidSecretKey(subordinateSeedSecret(keyId))).toBe(true)
  })

  it('gives different keys different names, so a write never overwrites another key', () => {
    const first = keyFromSeed(new Uint8Array(algorithm.lengths.seed).fill(1))
    const second = keyFromSeed(new Uint8Array(algorithm.lengths.seed).fill(2))
    expect(subordinateSeedSecret(first.keyId)).not.toBe(subordinateSeedSecret(second.keyId))
  })

  it('gives the same key the same name, so a seed is always found where it was put', () => {
    const seed = new Uint8Array(algorithm.lengths.seed).fill(5)
    expect(subordinateSeedSecret(keyFromSeed(seed).keyId)).toBe(subordinateSeedSecret(keyFromSeed(seed).keyId))
  })
})

describe('a key recovered from its seed', () => {
  const seed = new Uint8Array(algorithm.lengths.seed).fill(7)

  it('signs artifacts that verify under the id it is stored beneath', () => {
    // The property the whole scheme rests on: seed -> keypair -> keyId is a closed loop, so a key
    // reloaded after a restart is the key the registry published.
    const { keypair, keyId } = keyFromSeed(seed)
    const signingKey: SigningKey = { alg: SUBORDINATE_ALGORITHM, keyId, secretKey: keypair.secretKey }
    const envelope = sign('genoacms.roles.v1', { roles: {} }, signingKey)

    const reloaded = keyFromSeed(seed)
    expect(reloaded.keyId).toBe(keyId)
    expect(verify(envelope, 'genoacms.roles.v1', reloaded.keypair.publicKey))
      .toEqual({ valid: true, payload: { roles: {} } })
  })

  it('does not verify under a different key of the same generation', () => {
    const { keypair, keyId } = keyFromSeed(seed)
    const other = keyFromSeed(new Uint8Array(algorithm.lengths.seed).fill(8))
    const envelope = sign('genoacms.roles.v1', { roles: {} }, {
      alg: SUBORDINATE_ALGORITHM, keyId, secretKey: keypair.secretKey
    })
    expect(verify(envelope, 'genoacms.roles.v1', other.keypair.publicKey).valid).toBe(false)
  })

  it('is the subordinate algorithm, not the root one', () => {
    // The root signs only the registry; using it for artifacts would make every signature ~7.8 KB
    // and every signing operation take about a second.
    expect(SUBORDINATE_ALGORITHM).toBe('ML-DSA-65')
    expect(algorithm.lengths.signature).toBe(3309)
  })

  it('stores a seed far smaller than the key it derives', () => {
    const { keypair } = keyFromSeed(seed)
    expect(toBase64(seed).length).toBeLessThan(keypair.secretKey.length / 4)
  })
})
