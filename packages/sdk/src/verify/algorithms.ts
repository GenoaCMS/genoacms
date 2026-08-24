import { slh_dsa_sha2_128s as slhDsaSha2128s } from '@noble/post-quantum/slh-dsa.js'
import { ml_dsa65 as mlDsa65 } from '@noble/post-quantum/ml-dsa.js'

/**
 * The algorithms a verifier recognizes, by their exact specification names.
 *
 * **An unknown algorithm is rejected, never defaulted.** A verifier that fell back to a default
 * would verify a document against an algorithm its signer never used, and the outcome would say
 * nothing either way.
 *
 * The subordinate algorithm is expected to change. Each key in the registry carries its own `alg`,
 * so nothing here assumes one — an implementation that hardcoded ML-DSA-65 would break at the first
 * migration rather than report one.
 *
 * This is the one place the SDK and the CMS necessarily agree: both call the same library for the
 * primitive itself. Their agreement therefore attests to the framing — the canonical form, the
 * digest, what the signature covers — and not to the correctness of the underlying scheme.
 */

interface VerificationAlgorithm {
  readonly name: string
  readonly verify: (signature: Uint8Array, message: Uint8Array, publicKey: Uint8Array) => boolean
}

/**
 * Wraps a scheme so a malformed input reads as "does not verify" rather than as a crash.
 *
 * Everything reaching here came from storage, and a verifier that threw on a truncated signature
 * would turn a tampered document into an unhandled error — which fails, but in a shape a caller
 * cannot distinguish from the network being down.
 */
const guarded = (
  name: string,
  scheme: { verify: (sig: Uint8Array, msg: Uint8Array, key: Uint8Array) => boolean }
): VerificationAlgorithm => ({
  name,
  verify: (signature, message, publicKey) => {
    try {
      return scheme.verify(signature, message, publicKey)
    } catch {
      return false
    }
  }
})

const ALGORITHMS: Record<string, VerificationAlgorithm> = {
  'SLH-DSA-SHA2-128s': guarded('SLH-DSA-SHA2-128s', slhDsaSha2128s),
  'ML-DSA-65': guarded('ML-DSA-65', mlDsa65)
}

/** The algorithm the root anchor uses. Fixed, because the anchor cannot rotate cheaply. */
const ROOT_ALGORITHM = 'SLH-DSA-SHA2-128s'

const isAlgorithmName = (value: unknown): value is string =>
  typeof value === 'string' && Object.hasOwn(ALGORITHMS, value)

/** The named algorithm, or `undefined` — which the caller must treat as unverifiable. */
const getAlgorithm = (name: string): VerificationAlgorithm | undefined => ALGORITHMS[name]

export { ALGORITHMS, ROOT_ALGORITHM, isAlgorithmName, getAlgorithm }
export type { VerificationAlgorithm }
