import { describe, it, expect, beforeAll } from 'vitest'
import {
  ALGORITHM_NAMES,
  ROOT_ALGORITHM,
  SUBORDINATE_ALGORITHM,
  getAlgorithm,
  isAlgorithmName,
  type AlgorithmName,
  type Keypair
} from './algorithms'

const message = new TextEncoder().encode('the canonical bytes of a manifest')

/**
 * Signing with SLH-DSA takes on the order of a second, so each algorithm gets one keypair and one
 * signature, shared by the cases below.
 */
const fixtures = new Map<AlgorithmName, { keypair: Keypair, signature: Uint8Array }>()

beforeAll(() => {
  for (const name of ALGORITHM_NAMES) {
    const algorithm = getAlgorithm(name)
    const keypair = algorithm.generateKeypair()
    fixtures.set(name, { keypair, signature: algorithm.sign(message, keypair.secretKey) })
  }
}, 30_000)

describe('the registry', () => {
  it('registers the two algorithms of the tiered design', () => {
    expect([...ALGORITHM_NAMES]).toEqual(['SLH-DSA-SHA2-128s', 'ML-DSA-65'])
  })

  it('assigns the hash-based algorithm to the root and the lattice one to subordinates', () => {
    // The root is the layer that cannot be rotated cheaply, so it takes the conservative scheme.
    expect(ROOT_ALGORITHM).toBe('SLH-DSA-SHA2-128s')
    expect(SUBORDINATE_ALGORITHM).toBe('ML-DSA-65')
  })

  it('rejects an unknown algorithm rather than defaulting to one', () => {
    expect(() => getAlgorithm('RSA-2048')).toThrow(/unknown-signature-algorithm/)
    expect(() => getAlgorithm('')).toThrow(/unknown-signature-algorithm/)
  })

  it.each(['constructor', '__proto__', 'toString'])('does not resolve the inherited property %s', (name) => {
    expect(isAlgorithmName(name)).toBe(false)
    expect(() => getAlgorithm(name)).toThrow(/unknown-signature-algorithm/)
  })

  it.each([undefined, null, 42, {}])('rejects the non-string algorithm name %s', (value) => {
    expect(isAlgorithmName(value)).toBe(false)
  })
})

describe('declared sizes match the selected parameter sets', () => {
  // Guards against a library upgrade silently changing parameters: a 32-byte root public key is
  // what makes embedding it in a mobile SDK reasonable, and the payload arithmetic assumes these.
  it('SLH-DSA-SHA2-128s has a 32 byte public key and a 7856 byte signature', () => {
    expect(getAlgorithm('SLH-DSA-SHA2-128s').lengths).toMatchObject({
      publicKey: 32,
      signature: 7856,
      seed: 48
    })
  })

  it('ML-DSA-65 has a 1952 byte public key and a 3309 byte signature', () => {
    expect(getAlgorithm('ML-DSA-65').lengths).toMatchObject({
      publicKey: 1952,
      signature: 3309,
      seed: 32
    })
  })
})

describe.each([...ALGORITHM_NAMES])('%s', (name) => {
  const algorithm = () => getAlgorithm(name)
  const fixture = () => {
    const value = fixtures.get(name)
    if (value === undefined) throw new Error('fixture missing')
    return value
  }

  it('produces keys and signatures of the declared sizes', () => {
    const { keypair, signature } = fixture()
    expect(keypair.publicKey.length).toBe(algorithm().lengths.publicKey)
    expect(keypair.secretKey.length).toBe(algorithm().lengths.secretKey)
    expect(signature.length).toBe(algorithm().lengths.signature)
  })

  it('verifies a signature it produced', () => {
    const { keypair, signature } = fixture()
    expect(algorithm().verify(signature, message, keypair.publicKey)).toBe(true)
  })

  it('rejects a modified message', () => {
    const { keypair, signature } = fixture()
    const tampered = new TextEncoder().encode('the canonical bytes of a manifesT')
    expect(algorithm().verify(signature, tampered, keypair.publicKey)).toBe(false)
  })

  it('rejects a modified signature', () => {
    const { keypair, signature } = fixture()
    const tampered = Uint8Array.from(signature)
    tampered[0] ^= 0x01
    expect(algorithm().verify(tampered, message, keypair.publicKey)).toBe(false)
  })

  it('rejects a signature made for another key', () => {
    const { signature } = fixture()
    const stranger = algorithm().generateKeypair()
    expect(algorithm().verify(signature, message, stranger.publicKey)).toBe(false)
  })

  it('derives the same keypair from the same seed', () => {
    // Storing a 32 or 48 byte seed rather than a multi-kilobyte secret key depends on this.
    const seed = new Uint8Array(algorithm().lengths.seed).fill(7)
    const first = algorithm().generateKeypair(seed)
    const second = algorithm().generateKeypair(seed)
    expect(Array.from(first.publicKey)).toEqual(Array.from(second.publicKey))
    expect(Array.from(first.secretKey)).toEqual(Array.from(second.secretKey))
  })

  it('derives a different keypair from a different seed', () => {
    const a = algorithm().generateKeypair(new Uint8Array(algorithm().lengths.seed).fill(1))
    const b = algorithm().generateKeypair(new Uint8Array(algorithm().lengths.seed).fill(2))
    expect(Array.from(a.publicKey)).not.toEqual(Array.from(b.publicKey))
  })

  describe('malformed input returns false rather than throwing', () => {
    // These arrive from a bucket or over a network. A truncated signature is an ordinary thing for
    // an attacker to send, and it must not turn a failed verification into a crashed request.
    it('rejects a truncated signature', () => {
      const { keypair, signature } = fixture()
      expect(algorithm().verify(signature.slice(0, 10), message, keypair.publicKey)).toBe(false)
    })

    it('rejects an empty signature', () => {
      const { keypair } = fixture()
      expect(algorithm().verify(new Uint8Array(0), message, keypair.publicKey)).toBe(false)
    })

    it('rejects a wrong-sized public key', () => {
      const { signature } = fixture()
      expect(algorithm().verify(signature, message, new Uint8Array(7))).toBe(false)
    })

    it('rejects an empty public key', () => {
      const { signature } = fixture()
      expect(algorithm().verify(signature, message, new Uint8Array(0))).toBe(false)
    })

    it('rejects an oversized signature', () => {
      const { keypair, signature } = fixture()
      const padded = new Uint8Array(signature.length + 1)
      padded.set(signature)
      expect(algorithm().verify(padded, message, keypair.publicKey)).toBe(false)
    })
  })
})

describe('signing the same bytes twice', () => {
  /*
   * **Hedged by default, and repeatable only when asked.**
   *
   * ML-DSA and SLH-DSA both take fresh entropy per signature, which is what FIPS 204 and 205
   * recommend: the purely deterministic path is the one a fault-injection or side-channel attack has
   * something to work with. So signing one payload twice gives two different signatures, both valid,
   * and every published document is signed that way.
   *
   * The one caller that needs the other behavior is the conformance generator. Its output declares
   * *"do not edit by hand"*, and the only way anybody can check that nobody did is to regenerate it
   * and find the bytes identical — which randomized signatures make impossible.
   *
   * Asserted on the **subordinate** algorithm alone. SLH-DSA signs in about a second, and what is
   * under test is the option rather than either scheme.
   */
  const algorithm = () => getAlgorithm(SUBORDINATE_ALGORITHM)
  const keypair = () => fixtures.get(SUBORDINATE_ALGORITHM)!.keypair

  it('produces different signatures by default', () => {
    const { secretKey } = keypair()

    const first = algorithm().sign(message, secretKey)
    const second = algorithm().sign(message, secretKey)

    expect(first).not.toEqual(second)
  })

  it('produces the same signature when repeatability is asked for', () => {
    const { secretKey } = keypair()

    const first = algorithm().sign(message, secretKey, { reproducible: true })
    const second = algorithm().sign(message, secretKey, { reproducible: true })

    expect(first).toEqual(second)
  })

  it('produces a signature that verifies either way', () => {
    // Repeatability changes how the signature is made, not whether it is a signature. A vector in the
    // corpus is verified by implementations that know nothing about how it was produced.
    const { secretKey, publicKey } = keypair()
    const repeatable = algorithm().sign(message, secretKey, { reproducible: true })

    expect(algorithm().verify(repeatable, message, publicKey)).toBe(true)
  })

  it('stays hedged when the option says so explicitly', () => {
    // `{ reproducible: false }` must not be read as "an options bag was passed, so switch it off".
    const { secretKey } = keypair()

    const first = algorithm().sign(message, secretKey, { reproducible: false })
    const second = algorithm().sign(message, secretKey, { reproducible: false })

    expect(first).not.toEqual(second)
  })
})
