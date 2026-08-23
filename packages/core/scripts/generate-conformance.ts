import { canonicalString, digest, type JsonValue } from '../src/lib/script/signing/canonical'
import { getAlgorithm, SUBORDINATE_ALGORITHM } from '../src/lib/script/signing/algorithms'
import { deriveKeyId } from '../src/lib/script/signing/keyId'
import { sign, verify, toBase64 } from '../src/lib/script/signing/envelope'

/**
 * Emits the conformance corpus for the verification specification.
 *
 * Purely computational — it reads no configuration, touches no bucket and no secret store, so it is
 * safe to run to see what it does. Every value in the specification comes from here rather than
 * being written by hand, because a constant written from memory is a constant that is wrong.
 */

const hex = (bytes: Uint8Array): string =>
  [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')

interface CanonicalVector {
  name: string
  why: string
  payload: JsonValue
  canonical: string
  digest: string
}

const canonicalCase = (name: string, why: string, payload: JsonValue): CanonicalVector => ({
  name,
  why,
  payload,
  canonical: canonicalString(payload),
  digest: hex(digest(payload))
})

const canonicalVectors: CanonicalVector[] = [
  canonicalCase('object-key-order', 'Members are ordered by key, not by insertion.', { b: 1, a: 2 }),
  canonicalCase('key-order-utf16', 'Ordering is over UTF-16 code units, not locale collation: "z" precedes "ä".', { ä: 1, a: 2, z: 3 }),
  canonicalCase('nested-key-order', 'Ordering applies at every depth.', { outer: { b: 1, a: 2 } }),
  canonicalCase('array-order-preserved', 'Array order carries meaning and is never sorted.', { a: [3, 1, 2] }),
  canonicalCase('no-whitespace', 'No insignificant whitespace is emitted.', { a: 1, b: [1, 2] }),
  canonicalCase('number-exponent', 'Large numbers use ECMAScript exponent form.', { n: 1e30 }),
  canonicalCase('number-fraction', 'Fractions are shortest round-trip.', { n: 0.1 }),
  canonicalCase('number-integral-float', 'An integral double loses its trailing ".0".', { n: 1.0 }),
  canonicalCase('number-negative-zero', 'Negative zero normalizes to zero.', { n: -0 }),
  canonicalCase('unicode-literal', 'Non-ASCII is emitted literally, not escaped.', { s: '€' }),
  canonicalCase('escapes-minimal', 'Only what JSON requires is escaped.', { s: 'a\\"b\n' }),
  canonicalCase('omitted-key', 'An absent constraint is an absent key...', {}),
  canonicalCase('null-key', '...and is NOT the same document as a null one. Different digests.', { minimum: null }),
  canonicalCase('empty-array', 'An empty array is representable.', { a: [] }),
  canonicalCase('nested-empty', 'Empty containers nest.', { a: { b: {} } })
]

/** Deterministic from a fixed seed, so the corpus is reproducible by anyone. */
const algorithm = getAlgorithm(SUBORDINATE_ALGORITHM)
const seed = new Uint8Array(algorithm.lengths.seed).fill(42)
const keypair = algorithm.generateKeypair(seed)
const keyId = deriveKeyId(keypair.publicKey)

const payload: JsonValue = { roles: { Editor: [{ permission: 'pages:content_edit', resource: '*' }] } }
const valid = sign('genoacms.roles.v1', payload, {
  alg: SUBORDINATE_ALGORITHM,
  keyId,
  secretKey: keypair.secretKey
})

const mutate = (changes: Record<string, unknown>): unknown => ({ ...valid, ...changes })

interface EnvelopeVector {
  name: string
  why: string
  envelope: unknown
  accept: boolean
}

const envelopeVectors: EnvelopeVector[] = [
  { name: 'valid', why: 'The reference envelope. Must verify.', envelope: valid, accept: true },
  { name: 'payload-edited', why: 'The payload is covered by the signature.', envelope: mutate({ payload: { roles: { Editor: [{ permission: '*', resource: '*' }] } } }), accept: false },
  { name: 'key-id-swapped', why: 'keyId is bound into the digest, so it cannot be repointed.', envelope: mutate({ keyId: 'ffffffffffffffff' }), accept: false },
  { name: 'type-swapped', why: 'type is bound, so a document cannot be presented as another kind.', envelope: mutate({ type: 'genoacms.users.v1' }), accept: false },
  { name: 'alg-swapped', why: 'alg is bound, closing algorithm confusion.', envelope: mutate({ alg: 'SLH-DSA-SHA2-128s' }), accept: false },
  { name: 'signature-truncated', why: 'A short signature is rejected, not an error.', envelope: mutate({ signature: valid.signature.slice(0, 32) }), accept: false },
  { name: 'signature-not-base64', why: 'Base64 is decoded strictly; loose decoding would fail for the wrong reason.', envelope: mutate({ signature: 'not base64!!' }), accept: false },
  { name: 'signature-trailing-whitespace', why: 'Base64 must be exact; a lenient decoder would silently ignore this.', envelope: mutate({ signature: `${valid.signature} ` }), accept: false },
  { name: 'signature-one-bit-flipped', why: 'A single altered byte invalidates the signature.', envelope: mutate({ signature: (() => { const b = Buffer.from(valid.signature, 'base64'); b[0] ^= 1; return b.toString('base64') })() }), accept: false },
  { name: 'payload-missing', why: 'An absent payload is not an empty one.', envelope: (() => { const { payload: _p, ...rest } = valid; return rest })(), accept: false },
  { name: 'unknown-algorithm', why: 'Unknown algorithms are rejected, never defaulted.', envelope: mutate({ alg: 'RSA-2048' }), accept: false },
  { name: 'unknown-type', why: 'Unknown document types are rejected.', envelope: mutate({ type: 'genoacms.roles.v2' }), accept: false },
  { name: 'member-order-irrelevant', why: 'Envelope member order does not affect verification.', envelope: { signature: valid.signature, payload: valid.payload, type: valid.type, keyId: valid.keyId, alg: valid.alg }, accept: true }
]

// Every expected verdict is produced by the implementation, not asserted by hand.
const checked = envelopeVectors.map(vector => {
  const observed = verify(vector.envelope, 'genoacms.roles.v1', keypair.publicKey).valid
  if (observed !== vector.accept) {
    throw new Error(`conformance/disagreement: '${vector.name}' expected ${String(vector.accept)}, implementation says ${String(observed)}`)
  }
  return vector
})

const corpus = {
  note: 'Generated by packages/core/scripts/generate-conformance.ts. Do not edit by hand.',
  algorithm: SUBORDINATE_ALGORITHM,
  key: {
    seed: toBase64(seed),
    publicKey: toBase64(keypair.publicKey),
    keyId
  },
  canonicalization: canonicalVectors,
  envelopes: checked
}

console.log(JSON.stringify(corpus, null, 2))
