import { sha256 } from '@noble/hashes/sha2.js'

/**
 * Key identifiers are derived from the public key, never assigned.
 *
 * `keyId` is bound into every signature, so an identifier that could be reused for a different key
 * would make two distinct keys indistinguishable to a verifier — and the mismatch would surface
 * only as a verification failure long after the rotation that caused it. Deriving removes the
 * possibility: a different key is necessarily a different id, and a verifier handed a key and an
 * id can check that they agree.
 *
 * Sixteen hex characters is 64 bits, which is a naming scheme rather than a security boundary —
 * the signature is what establishes authenticity. It only has to make an accidental collision
 * across the handful of keys an instance ever holds effectively impossible.
 */
const KEY_ID_LENGTH = 16

function deriveKeyId (publicKey: Uint8Array): string {
  const hash = sha256(publicKey)
  return [...hash].map(byte => byte.toString(16).padStart(2, '0')).join('').slice(0, KEY_ID_LENGTH)
}

function matchesKeyId (publicKey: Uint8Array, keyId: string): boolean {
  return deriveKeyId(publicKey) === keyId
}

export {
  KEY_ID_LENGTH,
  deriveKeyId,
  matchesKeyId
}
