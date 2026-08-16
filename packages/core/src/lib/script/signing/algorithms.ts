import { ml_dsa65 as mlDsa65 } from '@noble/post-quantum/ml-dsa.js'
import { slh_dsa_sha2_128s as slhDsaSha2128s } from '@noble/post-quantum/slh-dsa.js'

/**
 * The signature algorithms GenoaCMS knows about.
 *
 * **This is the only file that imports the cryptographic library.** Everything above it names an
 * algorithm and gets an implementation, which is what makes the chain of trust algorithm-agile: a
 * subordinate key's algorithm travels inside the signed key registry, so replacing it means
 * publishing a new registry rather than redeploying consumers. That claim is only true while the
 * algorithm is a value in the data rather than a constant in the code.
 *
 * Containment also bounds the upgrade cost of the library itself, which is pre-1.0 and has already
 * moved its argument order relative to the older convention.
 */

const ALGORITHM_NAMES = ['SLH-DSA-SHA2-128s', 'ML-DSA-65'] as const

type AlgorithmName = typeof ALGORITHM_NAMES[number]

interface Keypair {
  publicKey: Uint8Array
  secretKey: Uint8Array
}

interface AlgorithmLengths {
  publicKey: number
  secretKey: number
  signature: number
  /** Seed size. A keypair is reproducible from its seed, so only the seed need be kept secret. */
  seed: number
}

interface SignatureAlgorithm {
  name: AlgorithmName
  lengths: AlgorithmLengths
  /** Deterministic when given a seed, random otherwise. */
  generateKeypair: (seed?: Uint8Array) => Keypair
  sign: (message: Uint8Array, secretKey: Uint8Array) => Uint8Array
  verify: (signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array) => boolean
}

interface NobleScheme {
  lengths: { publicKey: number, secretKey: number, signature: number, seed: number }
  keygen: (seed?: Uint8Array) => Keypair
  sign: (message: Uint8Array, secretKey: Uint8Array) => Uint8Array
  verify: (signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array) => boolean
}

function fromNoble (name: AlgorithmName, scheme: NobleScheme): SignatureAlgorithm {
  return {
    name,
    lengths: {
      publicKey: scheme.lengths.publicKey,
      secretKey: scheme.lengths.secretKey,
      signature: scheme.lengths.signature,
      seed: scheme.lengths.seed
    },
    generateKeypair: (seed) => scheme.keygen(seed),
    sign: (message, secretKey) => scheme.sign(message, secretKey),
    /**
     * Never throws. The library rejects a wrong-length key or signature by raising, but at this
     * boundary those arrive from a bucket or over a network — a truncated signature is an ordinary
     * thing for an attacker to send, and it must read as "does not verify" rather than crash the
     * request. Every failure mode collapses to `false`, which is the one a caller can act on.
     */
    verify: (signature, message, publicKey) => {
      try {
        return scheme.verify(signature, message, publicKey)
      } catch {
        return false
      }
    }
  }
}

const algorithms: Record<AlgorithmName, SignatureAlgorithm> = {
  'SLH-DSA-SHA2-128s': fromNoble('SLH-DSA-SHA2-128s', slhDsaSha2128s as unknown as NobleScheme),
  'ML-DSA-65': fromNoble('ML-DSA-65', mlDsa65 as unknown as NobleScheme)
}

/**
 * The root trust anchor. Hash-based and stateless, with a 32-byte public key small enough to embed
 * in a mobile SDK. Its slow signing does not matter — the root signs only the key registry.
 */
const ROOT_ALGORITHM: AlgorithmName = 'SLH-DSA-SHA2-128s'

/** Subordinate operational keys, which sign everything else. Fast, stateless, lattice-based. */
const SUBORDINATE_ALGORITHM: AlgorithmName = 'ML-DSA-65'

/**
 * Algorithm names arrive from signed payloads and stored registries, so this is where an untrusted
 * string becomes a known algorithm. Own-property lookup, because `'constructor' in algorithms` is
 * true and must not resolve to anything.
 */
function isAlgorithmName (value: unknown): value is AlgorithmName {
  return typeof value === 'string' && Object.hasOwn(algorithms, value)
}

function getAlgorithm (name: string): SignatureAlgorithm {
  if (!isAlgorithmName(name)) {
    throw new Error(`unknown-signature-algorithm: '${name}' is not one of ${ALGORITHM_NAMES.join(', ')}`)
  }
  return algorithms[name]
}

export {
  ALGORITHM_NAMES,
  ROOT_ALGORITHM,
  SUBORDINATE_ALGORITHM,
  isAlgorithmName,
  getAlgorithm
}

export type {
  AlgorithmName,
  SignatureAlgorithm,
  AlgorithmLengths,
  Keypair
}
