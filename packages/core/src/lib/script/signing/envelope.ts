import { getAlgorithm, isAlgorithmName, type AlgorithmName } from './algorithms'
import { digest, type JsonValue } from './canonical'

/**
 * The stored form of a signed document, and the rules for producing and checking one.
 *
 * A signed document is **one object**, not a payload beside a detached signature. Object storage
 * has no transaction, so writing two objects leaves a window in which an interrupted write pairs a
 * payload with its predecessor's signature — which the fail-closed path correctly reads as
 * tampering, turning a crash into an outage.
 */

/** Versioned document identifiers. The version lets a payload shape change without leaving old
 * signatures ambiguous about which shape they attested to. */
const DOCUMENT_TYPES = [
  'genoacms.roles.v1',
  'genoacms.users.v1',
  'genoacms.keyRegistry.v1',
  'genoacms.securityPolicy.v1',
  'genoacms.session.v1',
  'genoacms.componentPublication.v1',
  'genoacms.pageTree.v1'
] as const

type DocumentType = typeof DOCUMENT_TYPES[number]

interface SignedEnvelope<T extends JsonValue = JsonValue> {
  alg: AlgorithmName
  keyId: string
  type: DocumentType
  payload: T
  /** Standard base64, RFC 4648 §4, padded. */
  signature: string
}

/**
 * What the signature actually covers.
 *
 * Binding `alg`, `keyId` and `type` alongside the payload closes three substitutions available to
 * anyone who can write to the bucket: rewriting `alg` to a weaker registered algorithm, rewriting
 * `keyId` to a key whose signatures they can produce, and moving a valid `roles.json` signature
 * onto `users.json`. The outer fields exist only to locate the key *before* verification, and are
 * never trusted — verification rebuilds this object and re-derives the digest from it.
 */
function canonicalSignedObject (
  alg: AlgorithmName,
  keyId: string,
  type: DocumentType,
  payload: JsonValue
): JsonValue {
  return { alg, keyId, type, payload }
}

function isDocumentType (value: unknown): value is DocumentType {
  return typeof value === 'string' && (DOCUMENT_TYPES as readonly string[]).includes(value)
}

function toBase64 (bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64')
}

/**
 * Decodes base64 strictly.
 *
 * `Buffer.from(s, 'base64')` ignores anything it does not recognize, so a corrupted or truncated
 * signature would decode to *some* bytes and fail verification for the wrong reason. Re-encoding
 * and comparing is the cheapest way to reject input that was never valid base64 in the first place.
 */
function fromBase64 (value: string): Uint8Array | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined
  const bytes = new Uint8Array(Buffer.from(value, 'base64'))
  if (Buffer.from(bytes).toString('base64') !== value) return undefined
  return bytes
}

interface SigningKey {
  alg: AlgorithmName
  keyId: string
  secretKey: Uint8Array
}

function sign<T extends JsonValue> (
  type: DocumentType,
  payload: T,
  key: SigningKey
): SignedEnvelope<T> {
  const algorithm = getAlgorithm(key.alg)
  const signed = canonicalSignedObject(key.alg, key.keyId, type, payload)
  const signature = algorithm.sign(digest(signed), key.secretKey)
  return {
    alg: key.alg,
    keyId: key.keyId,
    type,
    payload,
    signature: toBase64(signature)
  }
}

type VerificationResult<T extends JsonValue> =
  | { valid: true, payload: T }
  | { valid: false, reason: string }

/**
 * Whether an envelope is well formed. Checked before anything is read out of it, because every
 * field below is attacker-controlled until the signature has been verified.
 */
function readEnvelope (candidate: unknown): SignedEnvelope | string {
  if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) {
    return 'envelope-not-an-object'
  }
  const { alg, keyId, type, payload, signature } = candidate as Record<string, unknown>
  if (!isAlgorithmName(alg)) return `envelope-unknown-algorithm: ${String(alg)}`
  if (typeof keyId !== 'string' || keyId.length === 0) return 'envelope-missing-key-id'
  if (!isDocumentType(type)) return `envelope-unknown-type: ${String(type)}`
  if (typeof signature !== 'string') return 'envelope-missing-signature'
  if (payload === undefined) return 'envelope-missing-payload'
  return { alg, keyId, type, payload: payload as JsonValue, signature }
}

/**
 * The envelope's header, **before** anything about it has been established.
 *
 * A verifier needs the `keyId` to fetch the key it will then verify against, so this much has to be
 * read untrusted — there is no way around it. The name says so, and the fields are used for lookup
 * only: `verify` re-reads them from the envelope and binds them into the digest, so a lie told here
 * makes the signature fail rather than taking effect.
 */
function peekUnverifiedHeader (candidate: unknown): { alg: AlgorithmName, keyId: string, type: DocumentType } | undefined {
  const envelope = readEnvelope(candidate)
  if (typeof envelope === 'string') return undefined
  return { alg: envelope.alg, keyId: envelope.keyId, type: envelope.type }
}

/**
 * Verifies an envelope against a public key, having been told which document it must be.
 *
 * `expectedType` is a parameter rather than something read from the envelope: a caller that
 * accepted whatever `type` the document declared would verify a genuine signature over a genuine
 * document, and simply be looking at the wrong one. The caller knows what it asked the storage
 * layer for, and that is what must match.
 */
function verify<T extends JsonValue> (
  candidate: unknown,
  expectedType: DocumentType,
  publicKey: Uint8Array
): VerificationResult<T> {
  const envelope = readEnvelope(candidate)
  if (typeof envelope === 'string') return { valid: false, reason: envelope }

  if (envelope.type !== expectedType) {
    return { valid: false, reason: `envelope-wrong-type: expected ${expectedType}, found ${envelope.type}` }
  }

  const signature = fromBase64(envelope.signature)
  if (signature === undefined) return { valid: false, reason: 'envelope-signature-not-base64' }

  let signed: Uint8Array
  try {
    signed = digest(canonicalSignedObject(envelope.alg, envelope.keyId, envelope.type, envelope.payload))
  } catch (error) {
    // The payload came from storage, so it may contain something JCS cannot represent. That is a
    // failed verification, not a crash.
    return { valid: false, reason: `envelope-payload-uncanonicalizable: ${(error as Error).message}` }
  }

  const algorithm = getAlgorithm(envelope.alg)
  if (!algorithm.verify(signature, signed, publicKey)) {
    return { valid: false, reason: 'envelope-signature-invalid' }
  }
  return { valid: true, payload: envelope.payload as T }
}

export {
  DOCUMENT_TYPES,
  isDocumentType,
  canonicalSignedObject,
  toBase64,
  fromBase64,
  peekUnverifiedHeader,
  sign,
  verify
}

export type {
  DocumentType,
  SignedEnvelope,
  SigningKey,
  VerificationResult
}
