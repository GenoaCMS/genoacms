import { canonicalString, digest, type JsonValue } from '../src/lib/script/signing/canonical'
import { getAlgorithm, SUBORDINATE_ALGORITHM } from '../src/lib/script/signing/algorithms'
import { deriveKeyId } from '../src/lib/script/signing/keyId'
import { sign, verify, toBase64 } from '../src/lib/script/signing/envelope'
import { PUBLICATION_DOCUMENT } from '../src/lib/script/components/publication/payload'

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
 * A publication, and the tampering it is signed against.
 *
 * The envelope vectors above use an authorization manifest, which exercises the envelope and nothing
 * about components. These exist because a **component publication** is the document a consumer has
 * to get right in order to call anything: it says what the component accepts, in what order, and —
 * when the component has code — what to run.
 *
 * ## What changed, and what a second implementer should know about it
 *
 * A publication used to be **two** documents, a header and an executable, signed separately and
 * written side by side. Everything a consumer needed was there, and nothing in either document said
 * the other belonged to it — so a correctly signed description from one release could be served
 * beside correctly signed code from another, the shapes would disagree, the bundle would be called
 * with the wrong parameter list, and no signature would be invalid.
 *
 * The corpus carried a `binding` section for exactly that hazard. **It is gone**, because the hazard
 * is: one document cannot be paired with itself wrongly. What survives is the pair of shape rules
 * the binding used to express across two documents, and they are vectors here — a prebuilt component
 * carrying code, and a dynamic one carrying none. An implementation that accepts either will run
 * something nobody published.
 *
 * The first property remains what it always was: the description is signed **at all**. A verifier
 * checking only the code would accept a rewritten parameter list and find every signature valid.
 */
const componentUid = '00000000-0000-4000-8000-000000000001'
const publicationId = '00000000-0000-4000-8000-0000000000a2'

const webBundle = {
  platform: 'web-esmodule',
  executableCode: 'export default function component (heading) { return heading }',
  compiledAt: 1_700_000_001_000
}

const publicationPayload: JsonValue = {
  uid: componentUid,
  publicationId,
  publisherId: 'user-1',
  publishedAt: 1_700_000_000_000,
  note: 'the reference publication',
  type: 'dynamic',
  name: 'Hero',
  attributes: { 'attr-1': { uid: 'attr-1', type: 'string', schema: { title: 'heading' } } },
  attributeOrder: ['attr-1'],
  executables: [webBundle]
} as unknown as JsonValue

/** The prebuilt reference: the key **absent**, never an empty list. See the vector's `why`. */
const { executables: _noCode, ...prebuiltRest } = publicationPayload as Record<string, unknown>
const prebuiltPayload = { ...prebuiltRest, type: 'prebuilt' } as JsonValue

const componentKey = { alg: SUBORDINATE_ALGORITHM, keyId, secretKey: keypair.secretKey }
const signedPublication = sign(PUBLICATION_DOCUMENT, publicationPayload, componentKey)
const signedPrebuilt = sign(PUBLICATION_DOCUMENT, prebuiltPayload, componentKey)

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
    name: 'component-publication',
    why: 'The reference publication: a description and the code it compiled to, under one signature.',
    expectedType: PUBLICATION_DOCUMENT,
    envelope: signedPublication,
    accept: true
  },
  {
    name: 'component-publication-prebuilt',
    why: 'A component whose code lives in the consuming application. Its description is the entire artifact, and the executables key is absent rather than empty — an empty list canonicalizes differently and would sign the same release two ways.',
    expectedType: PUBLICATION_DOCUMENT,
    envelope: signedPrebuilt,
    accept: true
  },
  {
    name: 'component-publication-attribute-order-edited',
    why: 'Reordering the attributes reorders the arguments, so every value lands in the wrong parameter while the code stays valid. This is what signing the description prevents.',
    expectedType: PUBLICATION_DOCUMENT,
    envelope: { ...signedPublication, payload: { ...publicationPayload as object, attributeOrder: ['attr-9', 'attr-1'] } },
    accept: false
  },
  {
    name: 'component-publication-code-edited',
    why: 'The bundle is inside the signed payload, so substituting it invalidates the same signature the description travels under. Two documents made this two separate checks.',
    expectedType: PUBLICATION_DOCUMENT,
    envelope: {
      ...signedPublication,
      payload: {
        ...publicationPayload as object,
        executables: [{ ...webBundle, executableCode: 'export default () => "owned"' }]
      }
    },
    accept: false
  },
  {
    name: 'component-publication-presented-as-page-tree',
    why: 'The envelope binds the document type into the digest, so a publication cannot be accepted where another kind of document belongs.',
    expectedType: 'genoacms.pageTree.v1',
    envelope: signedPublication,
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
 * The shape rules a signature does not settle, inside one publication.
 *
 * **Signature-free on purpose.** Each payload here is properly signed in practice; what these
 * vectors describe is what a verifier must refuse *after* the signature checks out. They are the
 * heirs of the old `binding` section: the same two hazards, no longer expressible as a mismatched
 * pair, still expressible by whoever holds the signing key.
 *
 * A verifier that skips them runs code for a component whose author never published any, or ignores
 * code a page was told to run. Both render something nobody released.
 */
interface ShapeVector {
  name: string
  why: string
  /** The declared kind, and the bundles the payload carries. */
  payload: { type: string, executables?: Array<{ platform: string }> }
  accept: boolean
}

const shapeVectors: ShapeVector[] = [
  {
    name: 'dynamic-with-code',
    why: 'The ordinary case: a component authored in the CMS, published with what it compiled to.',
    payload: { type: 'dynamic', executables: [{ platform: 'web-esmodule' }] },
    accept: true
  },
  {
    name: 'prebuilt-without-code',
    why: 'The ordinary case for a component the consuming application already contains.',
    payload: { type: 'prebuilt' },
    accept: true
  },
  {
    name: 'prebuilt-carrying-code',
    why: 'A bundle where a prebuilt component published none. Either the description was substituted or the code is nobody\'s: choosing which to believe would be guessing.',
    payload: { type: 'prebuilt', executables: [{ platform: 'web-esmodule' }] },
    accept: false
  },
  {
    name: 'dynamic-without-code',
    why: 'A component authored in the CMS with nothing to run. It verifies and renders nothing, which must be told apart from a component that was never published.',
    payload: { type: 'dynamic' },
    accept: false
  },
  {
    name: 'dynamic-with-empty-code-list',
    why: 'An empty list is not an absent key, and neither is a runnable release.',
    payload: { type: 'dynamic', executables: [] },
    accept: false
  },
  {
    name: 'duplicate-platforms',
    why: 'Two bundles for one target do not say which to run, and whichever a consumer picked would be signed — so nothing downstream could report the ambiguity.',
    payload: { type: 'dynamic', executables: [{ platform: 'web-esmodule' }, { platform: 'web-esmodule' }] },
    accept: false
  },
  {
    name: 'several-platforms',
    why: 'One release compiled for more than one target. A consumer selects the bundle it can run and must not refuse the release for also serving another runtime.',
    payload: { type: 'dynamic', executables: [{ platform: 'android-dex' }, { platform: 'web-esmodule' }] },
    accept: true
  }
]

/**
 * Whether a published document is the one the **page** pinned.
 *
 * Signature-free for the same reason the shape vectors are: the documents involved are properly
 * signed, and what these describe is the comparison that comes after each verifies on its own.
 *
 * The pair compared here is the **page tree** against the publication — two documents signed at
 * different times, by different acts, each perfectly valid, that can nonetheless disagree about what
 * a node is.
 *
 * `type` is the member a second-language implementer is most likely to skip, because a page renders
 * correctly without ever checking it. A node claiming `prebuilt` where the publication says
 * `dynamic` makes a consumer render its own local component under a name the CMS published code for;
 * the reverse sends it looking for a bundle that was never built. Neither is visible from either
 * document alone.
 */
interface PinVector {
  name: string
  why: string
  /** What the page node claimed. */
  pin: { uid: string, publicationId: string, type: string }
  /** What the published document says, under its own signature. */
  publication: { uid: string, publicationId: string, type: string }
  accept: boolean
}

const otherPublication = '00000000-0000-4000-8000-0000000000a3'
const dynamicPin = { uid: componentUid, publicationId, type: 'dynamic' }

const pinVectors: PinVector[] = [
  {
    name: 'pinned-publication-agrees',
    why: 'The ordinary case: the page pinned this publication and it is what was published there.',
    pin: dynamicPin,
    publication: dynamicPin,
    accept: true
  },
  {
    name: 'pinned-prebuilt-published-dynamic',
    why: 'The page composed a component whose code it supplies itself, and the publication carries code of its own. Both documents verify.',
    pin: { ...dynamicPin, type: 'prebuilt' },
    publication: dynamicPin,
    accept: false
  },
  {
    name: 'pinned-dynamic-published-prebuilt',
    why: 'The mirror: the consumer goes looking for a bundle this publication never had.',
    pin: dynamicPin,
    publication: { ...dynamicPin, type: 'prebuilt' },
    accept: false
  },
  {
    name: 'pinned-publication-replaced',
    why: 'A genuine, correctly signed release of another publication moved onto the path this one occupies. Merging the documents does not close this — only comparing the pin with the document does.',
    pin: dynamicPin,
    publication: { ...dynamicPin, publicationId: otherPublication },
    accept: false
  },
  {
    name: 'pinned-component-replaced',
    why: "Another component's publication entirely, correctly signed.",
    pin: dynamicPin,
    publication: { ...dynamicPin, uid: '00000000-0000-4000-8000-000000000009' },
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
  shapes: shapeVectors,
  pins: pinVectors
}

console.log(JSON.stringify(corpus, null, 2))
