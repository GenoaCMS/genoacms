import { digest, CanonicalizationError, type JsonValue } from './canonical.js'
import { getAlgorithm, isAlgorithmName } from './algorithms.js'

/**
 * The signed envelope, and what verifying one means.
 *
 * ## The signature is not over the payload
 *
 * It is over the digest of `{ alg, keyId, type, payload }`, rebuilt here from the envelope. The
 * outer fields exist only so the right key can be found before verification, and binding them closes
 * three substitutions available to anyone who can write to the storage: weakening `alg` to a lesser
 * recognized algorithm, rewriting `keyId` to a key whose signatures they can produce, and presenting
 * one document's valid signature as another document.
 *
 * ## `expectedType` is a parameter, not something read from the envelope
 *
 * A verifier that accepted whatever `type` the document declared would verify a genuine signature
 * over a genuine document and simply be looking at the wrong one. The caller knows what it asked
 * storage for; that is what has to match.
 */

interface SignedEnvelope {
  alg: string
  keyId: string
  type: string
  payload: JsonValue
  signature: string
}

/** The header, read before anything has been established. Used for key lookup and nothing else. */
interface UnverifiedHeader {
  alg: string
  keyId: string
  type: string
}

type VerificationResult =
  | { valid: true, payload: JsonValue }
  | { valid: false, reason: string }

const BASE64 = /^[A-Za-z0-9+/]*={0,2}$/

/**
 * Decodes base64 strictly.
 *
 * A decoder that skips what it does not recognize turns a corrupted signature into some *other*
 * signature, which then fails verification for the wrong reason — indistinguishable from a forgery
 * when it was actually a truncated download. Whitespace is rejected too, including trailing.
 */
const fromBase64 = (value: string): Uint8Array | undefined => {
  if (typeof value !== 'string' || !BASE64.test(value) || value.length % 4 !== 0) return undefined
  try {
    const binary = atob(value)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes
  } catch {
    return undefined
  }
}

/** Whether a candidate is shaped like an envelope. Checked before any field is used. */
const readEnvelope = (candidate: unknown): SignedEnvelope | string => {
  if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
    return 'envelope-not-an-object'
  }
  const { alg, keyId, type, payload, signature } = candidate as Record<string, unknown>
  if (!isAlgorithmName(alg)) return `envelope-unknown-algorithm: ${String(alg)}`
  if (typeof keyId !== 'string' || keyId.length === 0) return 'envelope-missing-key-id'
  if (typeof type !== 'string' || type.length === 0) return 'envelope-missing-type'
  if (typeof signature !== 'string') return 'envelope-missing-signature'
  if (payload === undefined) return 'envelope-missing-payload'
  return { alg, keyId, type, payload: payload as JsonValue, signature }
}

/**
 * The envelope's header, **before** anything about it is established.
 *
 * A verifier needs `keyId` to fetch the key it will verify against, so this much is unavoidably read
 * untrusted. The name says so. A lie told here makes the signature fail rather than taking effect,
 * because `verify` re-reads these from the envelope and binds them into the digest.
 */
const peekUnverifiedHeader = (candidate: unknown): UnverifiedHeader | undefined => {
  const envelope = readEnvelope(candidate)
  if (typeof envelope === 'string') return undefined
  return { alg: envelope.alg, keyId: envelope.keyId, type: envelope.type }
}

const verifyEnvelope = (
  candidate: unknown,
  expectedType: string,
  publicKey: Uint8Array
): VerificationResult => {
  const envelope = readEnvelope(candidate)
  if (typeof envelope === 'string') return { valid: false, reason: envelope }

  if (envelope.type !== expectedType) {
    return {
      valid: false,
      reason: `envelope-wrong-type: expected ${expectedType}, found ${envelope.type}`
    }
  }

  const signature = fromBase64(envelope.signature)
  if (signature === undefined) return { valid: false, reason: 'envelope-signature-not-base64' }

  let signed: Uint8Array
  try {
    signed = digest({
      alg: envelope.alg,
      keyId: envelope.keyId,
      type: envelope.type,
      payload: envelope.payload
    })
  } catch (error) {
    // The payload came from storage and may hold something JCS cannot represent. That is a failed
    // verification, not a crash.
    const reason = error instanceof CanonicalizationError ? error.message : String(error)
    return { valid: false, reason: `envelope-payload-uncanonicalizable: ${reason}` }
  }

  const algorithm = getAlgorithm(envelope.alg)
  if (algorithm === undefined) return { valid: false, reason: `envelope-unknown-algorithm: ${envelope.alg}` }
  if (!algorithm.verify(signature, signed, publicKey)) {
    return { valid: false, reason: 'envelope-signature-invalid' }
  }
  return { valid: true, payload: envelope.payload }
}

export { readEnvelope, peekUnverifiedHeader, verifyEnvelope, fromBase64 }
export type { SignedEnvelope, UnverifiedHeader, VerificationResult }
