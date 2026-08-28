import type { AttributeReference, ComponentHeaderAttributes } from '@genoacms/internal/attributes'
import type { ExecutablePlatform } from '@genoacms/internal/executable'
import type { ComponentHeader, ComponentType } from '../componentHeader/component/types'
import type { DocumentType, SignedEnvelope } from '$lib/script/signing/envelope'
import type { JsonValue } from '$lib/script/signing/canonical'
import { digest } from '$lib/script/signing/canonical'
import { bytesToHex } from '@noble/hashes/utils.js'

/**
 * A release of a component: one document, one signature.
 *
 * Pure: no storage, no keys, no clock. Signing is in `payload.server.ts` and writing in
 * `io.server.ts`, so what this file decides is only **what the signature will cover**.
 *
 * ## One document, where there were two
 *
 * A publication used to be a header and an executable, signed separately and written to two paths in
 * one directory. Everything a consumer needed was there, but nothing in either document said the
 * other belonged to it — so the pair had to be *checked* against each other after both verified, and
 * the check was the kind that every test of the happy path passes without.
 *
 * Three things existed only to hold that pair together: a binding function in the SDK, a section of
 * the conformance corpus devoted to it, and two refusals for a pair that disagreed about whether
 * code exists. **All three are gone**, because a header from one publication can no longer be paired
 * with an executable from another: there is no pairing. The property is enforced by shape rather
 * than by a comparison somebody has to remember to run.
 *
 * The write discipline collapsed with it. Two conditional writes had to be ordered so that a partial
 * failure left a survivable state; one write is either there or it is not.
 *
 * ## Why a description is signed at all
 *
 * A signed bundle secures *what a component does*. It says nothing about what the component
 * **accepts** — the parameter list is emitted from the description, so an unsigned one is something
 * anyone between the CMS and the consumer may rewrite, and the consumer would call a perfectly valid
 * bundle with values in the wrong parameters. It is also the reason a **prebuilt** component has a
 * publication at all: it has no code here, so its description is the entire thing to attest to.
 *
 * ## Executables are a list
 *
 * One publication, several targets. A component is released once and may be compiled for every
 * platform its language adapter can emit — so the platform belongs to an *entry* rather than to the
 * publication, and adding a second target later is another element rather than another signed
 * format.
 *
 * Today there is exactly one entry, because `language-adapter-ts` emits `web-esmodule` and nothing
 * else. Writing it as a list anyway costs nothing now and keeps the page from ever having to pin a
 * platform: a page pins `{uid, publicationId}`, so if publications were per-platform, a page built
 * on a web instance could not be served to a native consumer.
 *
 * **The cost, stated:** a consumer downloads the bundles for platforms it cannot run. That is zero
 * while there is one platform. If it ever stops being zero, the answer is to move `executableCode`
 * out to a file of its own and keep a SHA-256 digest here — which is no weaker, because the
 * envelope's own digest is already SHA-256 over the canonical form.
 */

/**
 * The type identifier this payload travels under.
 *
 * Versioned, so the shape can change later without leaving old signatures ambiguous about which one
 * they attested to. It replaces `genoacms.componentHeader.v1` and `genoacms.componentExecutable.v1`,
 * which are gone rather than deprecated — nothing has been released, and leaving them
 * registered would let a verifier accept half a publication as a whole document.
 */
const PUBLICATION_DOCUMENT: DocumentType = 'genoacms.componentPublication.v1'

/** What the CMS knows about a release, minus what the component itself supplies. */
interface ReleaseSubject {
  publicationId: string
  /** The principal who published it — `AuthContext.subject`. */
  publisherId: string
  publishedAt: number
  /** The publisher's own account of the release. */
  note: string
}

/**
 * A compiled bundle for one target.
 *
 * `compiledAt` is genuinely a different fact from the publication's `publishedAt`: one is when the
 * server built this bundle, the other when a person released the component. They diverge whenever a
 * target is added to a release that already exists.
 */
interface PublishedExecutable {
  platform: ExecutablePlatform
  executableCode: string
  compiledAt: number
}

/**
 * The whole of what a publication is.
 *
 * `note` is signed along with everything else, so the readable half of the audit trail is attested
 * rather than merely stored.
 */
interface ComponentPublication {
  uid: string
  publicationId: string
  publisherId: string
  publishedAt: number
  note: string
  type: ComponentType
  name: string
  attributes: ComponentHeaderAttributes
  attributeOrder: AttributeReference[]
  /**
   * The compiled bundles, one per target.
   *
   * **Absent for a prebuilt component — absent, never empty.** Under RFC 8785 `{}` and
   * `{"executables":[]}` are different documents, so a producer writing one where another wrote the
   * other would sign the same release two ways and no consumer could tell which was meant.
   */
  executables?: PublishedExecutable[]
}

class PublicationPayloadError extends Error {
  constructor (readonly field: string, message: string) {
    super(message)
    this.name = 'PublicationPayloadError'
  }
}

/**
 * Refuses an identifier that is absent or blank.
 *
 * Blank counts as absent. An empty `publisherId` would sign cleanly and produce an artifact
 * attributing itself to nobody, which reads as attribution while carrying none.
 */
const requireIdentifier = (field: string, value: string): string => {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new PublicationPayloadError(field, `A component publication needs a ${field}`)
  }
  return value
}

const requireTimestamp = (field: string, value: number): number => {
  if (!Number.isFinite(value)) {
    throw new PublicationPayloadError(field, `A component publication needs a numeric ${field}`)
  }
  return value
}

/**
 * Refuses an empty bundle.
 *
 * The compiler already refuses a source that compiles to nothing, so reaching here empty means the
 * pipeline lost the output between the two. Signing it would publish a verifiable artifact that
 * renders nothing, and the signature would say it was meant.
 */
const requireCode = (executableCode: string): string => {
  if (typeof executableCode !== 'string' || executableCode.trim() === '') {
    throw new PublicationPayloadError('executableCode', 'A component executable needs compiled code')
  }
  return executableCode
}

const buildExecutable = (executable: PublishedExecutable): PublishedExecutable => ({
  platform: requireIdentifier('platform', executable.platform),
  executableCode: requireCode(executable.executableCode),
  compiledAt: requireTimestamp('compiledAt', executable.compiledAt)
})

/**
 * Refuses a set of bundles a consumer could not resolve unambiguously.
 *
 * Two entries for one platform is not a richer publication, it is a publication that does not say
 * which bundle to run — and whichever a consumer picked would be signed, so nothing downstream could
 * report the ambiguity.
 */
const requireDistinctPlatforms = (executables: PublishedExecutable[]): PublishedExecutable[] => {
  const platforms = new Set(executables.map(executable => executable.platform))
  if (platforms.size !== executables.length) {
    throw new PublicationPayloadError(
      'executables',
      'A component publication carries at most one bundle per platform, and this one carries ' +
      'several for the same target — a consumer would have no way to say which was meant.'
    )
  }
  return executables
}

/**
 * Refuses the two combinations the merged document makes expressible.
 *
 * These were cross-document failures when a publication was a pair, caught only after both halves
 * had been fetched and verified. In one document they are malformed payloads, refused before
 * anything is signed — which is why this is the builder's business and not the consumer's.
 */
const requireCodeMatchingType = (
  type: ComponentType,
  executables: PublishedExecutable[] | undefined
): PublishedExecutable[] | undefined => {
  if (type === 'prebuilt') {
    if (executables !== undefined) {
      throw new PublicationPayloadError(
        'executables',
        'A prebuilt component\'s code lives in the consuming application, so its publication ' +
        'carries no bundle. One here would be a bundle nobody asked for.'
      )
    }
    return undefined
  }
  if (executables === undefined || executables.length === 0) {
    throw new PublicationPayloadError(
      'executables',
      'A dynamic component is published with the code it compiled to, and this publication has ' +
      'none — it would verify and render nothing.'
    )
  }
  return requireDistinctPlatforms(executables.map(buildExecutable))
}

/**
 * Builds the payload.
 *
 * Every member is supplied explicitly rather than spread from the stored header, because the
 * envelope's digest covers this payload whole and canonicalization drops an `undefined` member
 * silently — a field the caller forgot would produce a signature attesting to a payload nobody
 * supplied. Spreading would also carry any member the stored header later grows into the signed
 * document without anyone deciding it should be there.
 *
 * `executables` is spread in conditionally rather than assigned, so a prebuilt component's payload
 * has no such key at all. See the note on the field.
 */
const buildComponentPublication = (
  subject: ReleaseSubject,
  header: ComponentHeader,
  executables?: PublishedExecutable[]
): ComponentPublication => {
  const compiled = requireCodeMatchingType(header.type, executables)
  return {
    uid: requireIdentifier('uid', header.uid),
    publicationId: requireIdentifier('publicationId', subject.publicationId),
    publisherId: requireIdentifier('publisherId', subject.publisherId),
    publishedAt: requireTimestamp('publishedAt', subject.publishedAt),
    note: subject.note,
    type: header.type,
    name: requireIdentifier('name', header.name),
    attributes: header.attributes,
    attributeOrder: header.attributeOrder,
    ...(compiled === undefined ? {} : { executables: compiled })
  }
}

/**
 * What has to change for a description to be worth publishing again.
 *
 * Only the **describing** half: the identity of the publication that carried it is different every
 * time by construction, so including it would make every publication count as changed and defeat the
 * rule entirely. Computed by canonical digest rather than by comparing fields, so it cannot drift
 * from what is actually signed as the payload grows.
 *
 * Hex rather than raw bytes, because it is stored in a JSON record and compared with `!==`. A
 * `Uint8Array` round-tripped through storage would come back as an object and compare unequal to
 * itself, which would make every publication look like a change.
 */
const describingDigest = (header: ComponentHeader): string => bytesToHex(digest({
  type: header.type,
  name: header.name,
  attributes: header.attributes,
  attributeOrder: header.attributeOrder
} as unknown as JsonValue))

/**
 * The payload as the signer takes it.
 *
 * A cast rather than a conversion: `JsonValue` is what the canonicalizer accepts, and an interface
 * without an index signature does not satisfy it even though it canonicalizes perfectly well.
 * Stating that in one place keeps the assertion out of the call sites.
 */
const publicationPayload = (publication: ComponentPublication): JsonValue =>
  publication as unknown as JsonValue

/**
 * An envelope known to carry a publication.
 *
 * Not `SignedEnvelope<ComponentPublication>`. That generic constrains its payload to `JsonValue`,
 * which an interface without an index signature does not satisfy — the payload is nonetheless
 * perfectly canonicalizable, so the constraint is about how the type is declared rather than about
 * the document.
 *
 * `Omit` rather than an intersection: intersecting would leave the payload as `JsonValue &
 * ComponentPublication`, which still admits a string, and a caller could then not so much as spread
 * it.
 */
type SignedComponentPublication =
  Omit<SignedEnvelope, 'payload'> & { payload: ComponentPublication }

export {
  PUBLICATION_DOCUMENT,
  PublicationPayloadError,
  buildComponentPublication,
  describingDigest,
  publicationPayload
}

export type {
  ReleaseSubject,
  PublishedExecutable,
  ComponentPublication,
  SignedComponentPublication
}
