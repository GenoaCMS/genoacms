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

/**
 * The signing key, and what makes the whole corpus reproducible.
 *
 * The keypair comes from a fixed seed, so anyone gets the same key. That alone is not enough: signing
 * is **hedged** — fresh entropy per signature, which is what FIPS 204 recommends — so the same
 * payload signs differently every run, and regenerating this file used to rewrite every signature in
 * it while changing nothing it says.
 *
 * That matters because the file declares *"do not edit by hand"*, and the only way to check that
 * nobody did is to regenerate it and find the bytes identical. So every signature below is made with
 * the option that switches the hedging off. **Nothing that signs a real document does this** — see
 * `SigningOptions`, which says why at length.
 */
const REPRODUCIBLE = { reproducible: true }
const algorithm = getAlgorithm(SUBORDINATE_ALGORITHM)
const seed = new Uint8Array(algorithm.lengths.seed).fill(42)
const keypair = algorithm.generateKeypair(seed)
const keyId = deriveKeyId(keypair.publicKey)

const payload: JsonValue = { roles: { Editor: [{ permission: 'pages:content_edit', resource: '*' }] } }
const valid = sign('genoacms.roles.v1', payload, {
  alg: SUBORDINATE_ALGORITHM,
  keyId,
  secretKey: keypair.secretKey
}, REPRODUCIBLE)

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

/** The bounds a bundle was compiled against, as an ordinary instance would have them. */
const CEILINGS = { maxFuel: 1_000_000, maxDepth: 100, maxAllocation: 10_000_000 }

const webBundle = {
  platform: 'web-esmodule',
  executableCode: 'export default function component (heading) { return heading }',
  compiledAt: 1_700_000_001_000,
  ceilings: CEILINGS
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
const signedPublication = sign(PUBLICATION_DOCUMENT, publicationPayload, componentKey, REPRODUCIBLE)
const signedPrebuilt = sign(PUBLICATION_DOCUMENT, prebuiltPayload, componentKey, REPRODUCIBLE)

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
/**
 * One bundle, as a shape vector varies it.
 *
 * `ceilings` is carried per entry and may be **omitted**, which is itself a case: a bundle that
 * cannot say what bounds it was built against is one whose signature attests to less than it
 * appears to. A consumer of this corpus reproduces the entry exactly, including the omission.
 */
interface ShapeExecutable {
  platform: string
  ceilings?: unknown
}

interface ShapeVector {
  name: string
  why: string
  /** The declared kind, and the bundles the payload carries. */
  payload: { type: string, executables?: ShapeExecutable[] }
  accept: boolean
}

/** A bundle whose bounds are the ordinary ones, so a vector only spells out what it varies. */
const bounded = (platform = 'web-esmodule'): ShapeExecutable => ({ platform, ceilings: CEILINGS })

const shapeVectors: ShapeVector[] = [
  {
    name: 'dynamic-with-code',
    why: 'The ordinary case: a component authored in the CMS, published with what it compiled to.',
    payload: { type: 'dynamic', executables: [bounded()] },
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
    payload: { type: 'prebuilt', executables: [bounded()] },
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
    payload: { type: 'dynamic', executables: [bounded(), bounded()] },
    accept: false
  },
  {
    name: 'several-platforms',
    why: 'One release compiled for more than one target. A consumer selects the bundle it can run and must not refuse the release for also serving another runtime.',
    payload: { type: 'dynamic', executables: [bounded('android-dex'), bounded()] },
    accept: true
  },
  {
    name: 'bundle-without-ceilings',
    why: 'A bundle that does not say what bounds it was compiled against. The code inside it is bounded, but nothing signed says by how much, so the signature attests to less than it appears to.',
    payload: { type: 'dynamic', executables: [{ platform: 'web-esmodule' }] },
    accept: false
  },
  {
    name: 'bundle-with-partial-ceilings',
    why: 'Two of the three bounds. A verifier defaulting the third would be deciding a limit the instance never signed.',
    payload: { type: 'dynamic', executables: [{ platform: 'web-esmodule', ceilings: { maxFuel: 1_000_000, maxDepth: 100 } }] },
    accept: false
  },
  {
    name: 'bundle-with-a-ceiling-of-zero',
    why: 'A bound that permits nothing is not a bound anyone meant to set; it is a component that cannot run.',
    payload: { type: 'dynamic', executables: [{ platform: 'web-esmodule', ceilings: { maxFuel: 0, maxDepth: 100, maxAllocation: 10_000_000 } }] },
    accept: false
  },
  {
    name: 'bundle-with-a-negative-ceiling',
    why: 'Negative bounds cannot be reached, so every guard would trip on its first call.',
    payload: { type: 'dynamic', executables: [{ platform: 'web-esmodule', ceilings: { maxFuel: 1_000_000, maxDepth: -1, maxAllocation: 10_000_000 } }] },
    accept: false
  },
  {
    name: 'bundle-with-a-fractional-ceiling',
    why: 'A signed document is canonicalized, and a fraction is a value two implementations can disagree about the spelling of.',
    payload: { type: 'dynamic', executables: [{ platform: 'web-esmodule', ceilings: { maxFuel: 1_000_000.5, maxDepth: 100, maxAllocation: 10_000_000 } }] },
    accept: false
  },
  {
    name: 'bundle-with-a-ceiling-written-as-text',
    why: 'A bound a verifier would have to parse is a bound two verifiers could parse differently.',
    payload: { type: 'dynamic', executables: [{ platform: 'web-esmodule', ceilings: { maxFuel: '1000000', maxDepth: 100, maxAllocation: 10_000_000 } }] },
    accept: false
  },
  {
    name: 'bundle-with-severe-ceilings',
    why: 'Bounds an author would find unusable are still bounds. Whether they are generous is the publishing instance\'s decision, and no business of a verifier.',
    payload: { type: 'dynamic', executables: [{ platform: 'web-esmodule', ceilings: { maxFuel: 1, maxDepth: 1, maxAllocation: 1 } }] },
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

/**
 * How a page's values reach a component's parameters.
 *
 * **The join a second implementation is most likely to miss entirely**, because nothing in either
 * document points at the other. A publication states its parameter order as attribute *references* —
 * uids, which exist so that renaming an attribute in the CMS does not lose the value bound to it. A
 * published page keys each node's `data` by the attribute's **name**, the one a person typed. So a
 * consumer walks the order, turns each reference into a name through the publication's `attributes`,
 * and looks the value up under it.
 *
 * An implementation that instead read the page's `data` in its own key order would render every
 * ordinary page correctly and silently mis-assign values the moment an author reordered anything.
 * That is why the accepted vectors carry the expected `names`: agreeing that a publication is
 * acceptable is not the property under test, the **order** is.
 *
 * Signature-free, like the shape and pin vectors, and for the same reason: every payload here is
 * properly signed in practice, and what these describe is what a verifier must work out once the
 * signature checks out.
 *
 * ## Why a duplicate name is refused rather than resolved
 *
 * The page's `data` is keyed by name, so when two attributes share one the second value overwrites
 * the first as the tree is built — and the tree is signed **afterwards**. One parameter silently
 * receives another's value and every signature over the result is valid. The CMS refuses to save such
 * a component, but publications are immutable and a page pins one, so a release made before that rule
 * existed still verifies and is still reachable. A consumer that does not check is a consumer that
 * renders it.
 *
 * Two names are compared with their ends trimmed, which is a wider net than equality: `Body` and
 * `Body ` are different keys and the same name to anybody reading them. Case is **not** folded —
 * `Body` and `body` are two names a person chose to write differently, and both survive into two
 * distinct parameters.
 */
interface AttributeNameVector {
  name: string
  why: string
  /** What the publication describes, by reference. */
  attributes: Record<string, unknown>
  /** The references, in the order the component's parameters take them. */
  attributeOrder: string[]
  accept: boolean
  /** For an accepted vector, the names to look each value up by, in that same order. */
  names?: string[]
}

/** An attribute as a publication carries it. `title` is the name a person typed into the registrar. */
const describes = (reference: string, title: unknown): [string, unknown] =>
  [reference, { uid: reference, type: 'string', schema: title === undefined ? {} : { title } }]

const attributeNameVectors: AttributeNameVector[] = [
  {
    name: 'attribute-names-in-parameter-order',
    why: 'The order is the publication\'s: not the order the attributes are written in, and not alphabetical. Three names arranged so that reading them by insertion order, by sorting, or by reversing each produces a different answer — because each of those is a plausible implementation that renders every ordinary page correctly and shuffles the arguments of this one.',
    attributes: Object.fromEntries([
      describes('attr-1', 'Body'), describes('attr-2', 'Alpha'), describes('attr-3', 'Zebra')
    ]),
    attributeOrder: ['attr-3', 'attr-1', 'attr-2'],
    accept: true,
    names: ['Zebra', 'Body', 'Alpha']
  },
  {
    name: 'attribute-name-taken-verbatim',
    why: 'The name is a storage key, not a label: it is what the page wrote. Tidying it would look for a value under something no page ever stored.',
    attributes: Object.fromEntries([describes('attr-1', ' Heading ')]),
    attributeOrder: ['attr-1'],
    accept: true,
    names: [' Heading ']
  },
  {
    name: 'attribute-names-none',
    why: 'A component that takes no parameters. An empty order is an ordinary release, not a malformed one.',
    attributes: {},
    attributeOrder: [],
    accept: true,
    names: []
  },
  {
    name: 'attribute-names-differing-in-case',
    why: 'Two names a person chose to write differently. They key a page differently and survive into two distinct parameters, so folding case here would refuse a perfectly good release.',
    attributes: Object.fromEntries([describes('attr-1', 'Body'), describes('attr-2', 'body')]),
    attributeOrder: ['attr-2', 'attr-1'],
    accept: true,
    names: ['body', 'Body']
  },
  {
    name: 'attribute-names-duplicated',
    why: 'The page stores one value where two belong, because its data is keyed by name and the tree is signed after the collision. One parameter receives another\'s value with every signature valid.',
    attributes: Object.fromEntries([describes('attr-1', 'Heading'), describes('attr-2', 'Heading')]),
    attributeOrder: ['attr-1', 'attr-2'],
    accept: false
  },
  {
    name: 'attribute-names-differing-only-at-the-ends',
    why: 'Different keys, and the same name to anyone reading them. Refused on the wider comparison, because nobody should have to tell "Body" from "Body " by eye to know which value was lost.',
    attributes: Object.fromEntries([describes('attr-1', 'Body'), describes('attr-2', 'Body ')]),
    attributeOrder: ['attr-1', 'attr-2'],
    accept: false
  },
  {
    name: 'attribute-order-names-an-undescribed-attribute',
    why: 'One parameter would have no name and therefore no value, while every later argument stayed in place — a call that looks ordinary and is wrong from that position onward.',
    attributes: Object.fromEntries([describes('attr-1', 'Heading')]),
    attributeOrder: ['attr-1', 'attr-2'],
    accept: false
  },
  {
    name: 'attribute-without-a-name',
    why: 'There is nothing to look a value up by. Passing nothing would leave the parameter undefined with no way to tell that from an attribute a page genuinely left empty.',
    attributes: Object.fromEntries([describes('attr-1', undefined)]),
    attributeOrder: ['attr-1'],
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
  pins: pinVectors,
  attributeNames: attributeNameVectors
}

console.log(JSON.stringify(corpus, null, 2))
