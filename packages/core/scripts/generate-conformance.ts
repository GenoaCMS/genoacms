import { canonicalString, digest, type JsonValue } from '../src/lib/script/signing/canonical'
import { getAlgorithm, SUBORDINATE_ALGORITHM } from '../src/lib/script/signing/algorithms'
import { deriveKeyId } from '../src/lib/script/signing/keyId'
import { sign, verify, toBase64 } from '../src/lib/script/signing/envelope'
import { HEADER_DOCUMENT } from '../src/lib/script/components/publication/header'
import { EXECUTABLE_DOCUMENT } from '../src/lib/script/components/executable/executable'

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

/**
 * The two documents one publication produces, and the tampering each is signed against.
 *
 * The envelope vectors above use an authorization manifest, which exercises the envelope and nothing
 * about components. These exist because a **component** publication is a *pair*: a header saying what
 * the component accepts and — when it has code — an executable saying what it does. A second-language
 * implementer has two things to get right that the manifest cannot show them.
 *
 * The first is that the header is signed **at all**. A verifier checking only the executable would
 * accept a rewritten parameter list, call the bundle with values in the wrong parameters, and find
 * every signature valid.
 *
 * The second is that the two document types must not be interchangeable. Both describe the same
 * component and share most of their identity fields, so an implementation that verified the envelope
 * without binding `type` would accept a header where an executable belongs.
 */
const componentUid = '00000000-0000-4000-8000-000000000001'
const publicationId = '00000000-0000-4000-8000-0000000000a2'

const headerPayload: JsonValue = {
  uid: componentUid,
  publicationId,
  publisherId: 'user-1',
  publishedAt: 1_700_000_000_000,
  note: 'the reference publication',
  type: 'dynamic',
  name: 'Hero',
  attributes: { 'attr-1': { uid: 'attr-1', type: 'string', schema: { title: 'heading' } } },
  attributeOrder: ['attr-1']
}

const executablePayload: JsonValue = {
  uid: componentUid,
  publicationId,
  publisherId: 'user-1',
  publishedAt: 1_700_000_000_000,
  platform: 'web-esmodule',
  executableCode: 'export default function component (heading) { return heading }',
  compiledAt: 1_700_000_001_000
}

const componentKey = { alg: SUBORDINATE_ALGORITHM, keyId, secretKey: keypair.secretKey }
const signedHeader = sign(HEADER_DOCUMENT, headerPayload, componentKey)
const signedExecutable = sign(EXECUTABLE_DOCUMENT, executablePayload, componentKey)

interface DocumentVector {
  name: string
  why: string
  /** The type a verifier is asked to accept it as. */
  expectedType: string
  envelope: unknown
  accept: boolean
}

const documentVectors: DocumentVector[] = [
  {
    name: 'component-header',
    why: 'The reference header. A publication of a prebuilt component is this document alone.',
    expectedType: HEADER_DOCUMENT,
    envelope: signedHeader,
    accept: true
  },
  {
    name: 'component-header-attribute-order-edited',
    why: 'Reordering the attributes reorders the arguments, so every value lands in the wrong parameter while the executable stays valid. This is what signing the header prevents.',
    expectedType: HEADER_DOCUMENT,
    envelope: { ...signedHeader, payload: { ...headerPayload as object, attributeOrder: ['attr-9', 'attr-1'] } },
    accept: false
  },
  {
    name: 'component-header-presented-as-executable',
    why: 'The two documents of one publication share their identity fields; only the bound type tells them apart.',
    expectedType: EXECUTABLE_DOCUMENT,
    envelope: signedHeader,
    accept: false
  },
  {
    name: 'component-executable',
    why: 'The reference executable. Published beside the header when a component has code.',
    expectedType: EXECUTABLE_DOCUMENT,
    envelope: signedExecutable,
    accept: true
  },
  {
    name: 'component-executable-presented-as-header',
    why: 'The mirror of the case above.',
    expectedType: HEADER_DOCUMENT,
    envelope: signedExecutable,
    accept: false
  }
]

const checkedDocuments = documentVectors.map(vector => {
  const observed = verify(vector.envelope, vector.expectedType as never, keypair.publicKey).valid
  if (observed !== vector.accept) {
    throw new Error(`conformance/disagreement: '${vector.name}' expected ${String(vector.accept)}, implementation says ${String(observed)}`)
  }
  return vector
})

/**
 * Whether a header and an executable belong to each other.
 *
 * **Signature-free on purpose.** Each document here is properly signed in practice; what these
 * vectors describe is the check that comes *after* both verify. The pair is fetched and cached
 * separately, so nothing about either document prevents a header from one publication being used
 * with an executable from another — the shapes disagree, the bundle is called with the wrong
 * parameter list, and both signatures are perfectly valid.
 */
interface BindingVector {
  name: string
  why: string
  header: { uid: string, publicationId: string }
  executable: { uid: string, publicationId: string }
  accept: boolean
}

const bindingVectors: BindingVector[] = [
  {
    name: 'same-publication',
    why: 'The ordinary case: one publication produced both.',
    header: { uid: componentUid, publicationId },
    executable: { uid: componentUid, publicationId },
    accept: true
  },
  {
    name: 'different-publication',
    why: 'Two genuine documents of the same component from different publications. Both verify; the pair must still be refused.',
    header: { uid: componentUid, publicationId },
    executable: { uid: componentUid, publicationId: '00000000-0000-4000-8000-0000000000a3' },
    accept: false
  },
  {
    name: 'different-component',
    why: "A header describing one component beside another component's code.",
    header: { uid: componentUid, publicationId },
    executable: { uid: '00000000-0000-4000-8000-000000000009', publicationId },
    accept: false
  }
]

const corpus = {
  note: 'Generated by packages/core/scripts/generate-conformance.ts. Do not edit by hand.',
  algorithm: SUBORDINATE_ALGORITHM,
  key: {
    seed: toBase64(seed),
    publicKey: toBase64(keypair.publicKey),
    keyId
  },
  canonicalization: canonicalVectors,
  envelopes: checked,
  documents: checkedDocuments,
  binding: bindingVectors
}

console.log(JSON.stringify(corpus, null, 2))
