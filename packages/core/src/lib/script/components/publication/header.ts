import type { AttributeReference, ComponentHeaderAttributes } from '@genoacms/internal/attributes'
import type { ComponentHeader, ComponentType } from '../componentHeader/component/types'
import type { DocumentType, SignedEnvelope } from '$lib/script/signing/envelope'
import type { JsonValue } from '$lib/script/signing/canonical'
import { digest } from '$lib/script/signing/canonical'
import { bytesToHex } from '@noble/hashes/utils.js'

/**
 * The header a consumer receives, and the digest that decides whether it has changed.
 *
 * Pure: no storage, no keys, no clock. Signing is in `header.server.ts` and writing in
 * `io.server.ts`, so what this file decides is only **what the signature will cover**.
 *
 * ## Why a header is signed at all
 *
 * A signed executable secures *what a component does*. It says nothing about what the component
 * *accepts* — the parameter list is emitted from the header, so an unsigned header is a description
 * anyone between the CMS and the consumer may rewrite, and the consumer would call a perfectly valid
 * executable with values in the wrong parameters. Signing both is what closes that, and it is the
 * reason a **prebuilt** component has a publication at all: it has no code, so its header is the
 * entire thing there is to attest to.
 *
 * ## Bound to its publication, and to its executable
 *
 * `publicationId` is in the payload rather than only in the path. A consumer that fetched a header
 * and an executable separately could otherwise be served two documents from different publications,
 * each properly signed, whose shapes disagree — which is the same wrong-parameter failure by another
 * route. Carrying the identifier inside both payloads makes the pair checkable.
 */

/** The type identifier this payload travels under. Versioned, so the shape can change later without
 * leaving old signatures ambiguous about which one they attested to. */
const HEADER_DOCUMENT: DocumentType = 'genoacms.componentHeader.v1'

/** What the CMS knows about a publication, minus what the header itself supplies. */
interface HeaderSubject {
  publicationId: string
  /** The principal who published it — `AuthContext.subject`. */
  publisherId: string
  publishedAt: number
  /** The publisher's own account of the release. */
  note: string
}

/**
 * A published component header.
 *
 * The describing half is exactly `ComponentHeader` minus nothing: a consumer needs the name to
 * resolve a prebuilt component against its own map, the type to know whether to fetch an executable,
 * and the attributes and their order to call it. Nothing about how the author arrived at any of it
 * travels — the editing history lives in an adjunct beside the header and is not part of this.
 *
 * `note` is here because there is nowhere else for it. A publication directory holds a header and,
 * for a dynamic component, an executable; a third object for the note would be an object consumers
 * fetch and discard. Signed along with everything else, so the audit trail is attested rather than
 * merely stored.
 */
interface PublishedComponentHeader {
  uid: string
  publicationId: string
  publisherId: string
  publishedAt: number
  note: string
  type: ComponentType
  name: string
  attributes: ComponentHeaderAttributes
  attributeOrder: AttributeReference[]
}

class HeaderPublicationError extends Error {
  constructor (readonly field: string, message: string) {
    super(message)
    this.name = 'HeaderPublicationError'
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
    throw new HeaderPublicationError(field, `A published component header needs a ${field}`)
  }
  return value
}

const requireTimestamp = (field: string, value: number): number => {
  if (!Number.isFinite(value)) {
    throw new HeaderPublicationError(field, `A published component header needs a numeric ${field}`)
  }
  return value
}

/**
 * Builds the payload.
 *
 * Every member is supplied explicitly rather than spread from the stored header, because the
 * envelope's digest covers this payload whole and canonicalization drops an `undefined` member
 * silently — a field the caller forgot would produce a signature attesting to a payload nobody
 * supplied. Spreading would also carry any member the stored header later grows into the signed
 * document without anyone deciding it should be there.
 */
const buildPublishedHeader = (
  subject: HeaderSubject,
  header: ComponentHeader
): PublishedComponentHeader => ({
  uid: requireIdentifier('uid', header.uid),
  publicationId: requireIdentifier('publicationId', subject.publicationId),
  publisherId: requireIdentifier('publisherId', subject.publisherId),
  publishedAt: requireTimestamp('publishedAt', subject.publishedAt),
  note: subject.note,
  type: header.type,
  name: requireIdentifier('name', header.name),
  attributes: header.attributes,
  attributeOrder: header.attributeOrder
})

/**
 * What has to change for a header to be worth publishing again.
 *
 * Only the **describing** half: the identity of the publication that carried it is different every
 * time by construction, so including it would make every header count as changed and defeat the
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
const headerPayload = (header: PublishedComponentHeader): JsonValue =>
  header as unknown as JsonValue

/** An envelope known to carry a published header. See `SignedComponentExecutable` for the `Omit`. */
type SignedComponentHeader =
  Omit<SignedEnvelope, 'payload'> & { payload: PublishedComponentHeader }

export {
  HEADER_DOCUMENT,
  HeaderPublicationError,
  buildPublishedHeader,
  describingDigest,
  headerPayload
}

export type {
  HeaderSubject,
  PublishedComponentHeader,
  SignedComponentHeader
}
