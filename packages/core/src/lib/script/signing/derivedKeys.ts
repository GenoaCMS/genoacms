import { hkdf } from '@noble/hashes/hkdf.js'
import { sha256 } from '@noble/hashes/sha2.js'

/**
 * Keys derived from the root seed for purposes other than signing artifacts.
 *
 * Deriving rather than storing means there is one fewer secret for an operator to set, to set
 * weakly, or to leak. The seed already exists and is already handled as the most sensitive value in
 * the system; a derived key inherits that handling rather than adding to it.
 *
 * **The label is what makes this sound.** The same seed produces the root signing keypair, so the
 * HKDF `info` string binds each derivation to one purpose: outputs under different labels are
 * unrelated, and a future purpose is a new label rather than a collision. Changing a label changes
 * the key, so labels are versioned and never edited in place.
 */

const SESSION_TOKEN_LABEL = 'genoacms:session-token:v1'
const SESSION_KEY_BYTES = 32

/**
 * The HMAC key that signs session tokens.
 *
 * Symmetric on purpose: session tokens are issued and verified by the same server and by nobody
 * else, so asymmetric signing would buy nothing while costing a token too large for a cookie.
 */
function deriveSessionKey (rootSeed: Uint8Array): Uint8Array {
  const info = new TextEncoder().encode(SESSION_TOKEN_LABEL)
  return hkdf(sha256, rootSeed, undefined, info, SESSION_KEY_BYTES)
}

export {
  SESSION_TOKEN_LABEL,
  SESSION_KEY_BYTES,
  deriveSessionKey
}
