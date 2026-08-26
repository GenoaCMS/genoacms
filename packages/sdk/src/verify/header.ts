import type { JsonValue } from './canonical.js'
import type { Read } from './pageTree.js'

/**
 * The published description of a component: what a consumer must know to *call* it.
 *
 * Re-stated from the published format rather than imported from the CMS, for the reason the page
 * tree and the executable are: this is what an application receives, and an application has no
 * reason to depend on the thing that produced it.
 *
 * ## Why a consumer needs this signed
 *
 * A signed executable attests to *what a component does*. It says nothing about what the component
 * **accepts** — the parameter list is emitted from this header, so an unsigned header is a
 * description anyone between the CMS and the consumer may rewrite. The executable would still
 * verify, and would be called with the right values in the wrong parameters. Nothing about the
 * bundle could reveal it.
 *
 * It is also the whole of what a **prebuilt** component publishes. Such a component has no code
 * here — it lives in the consuming application — so its header is the entire artifact, and
 * `attributeOrder` is the only thing that says which of the host's parameters receives which value.
 */

const HEADER_DOCUMENT = 'genoacms.componentHeader.v1'

/** Whether the component's code is published beside this header or lives in the consuming app. */
type ComponentType = 'prebuilt' | 'dynamic'

interface PublishedComponentHeader {
  /** The component this describes. */
  uid: string
  /** The publication that produced it. Shared with the executable, when there is one. */
  publicationId: string
  /** The principal who published it. Attribution, and the audit trail. */
  publisherId: string
  publishedAt: number
  /** The publisher's own account of the release. */
  note: string
  /** Whether to expect an executable beside this. */
  type: ComponentType
  /** What a person calls it, and how a prebuilt component is resolved against the host's map. */
  name: string
  /** The attributes, by reference. Opaque to this SDK, which passes them on rather than reading. */
  attributes: Record<string, JsonValue>
  /** **The order the attributes are passed in.** Without it the values have no destination. */
  attributeOrder: string[]
}

const failed = (reason: string): Read<never> => ({ ok: false, reason })

const isRecord = (value: unknown): value is Record<string, JsonValue> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const nonEmptyString = (value: JsonValue | undefined): value is string =>
  typeof value === 'string' && value.length > 0

const isStringArray = (value: JsonValue | undefined): value is string[] =>
  Array.isArray(value) && value.every(entry => typeof entry === 'string')

/** Reads a verified payload as a header, or names what is wrong with it. */
const readHeader = (payload: JsonValue): Read<PublishedComponentHeader> => {
  if (!isRecord(payload)) return failed('header-not-an-object')

  const { uid, publicationId, publisherId, publishedAt, note, type, name, attributes, attributeOrder } = payload

  if (!nonEmptyString(uid)) return failed('header-missing-uid')
  if (!nonEmptyString(publicationId)) return failed('header-missing-publication-id')
  // Attribution is what makes the audit trail real, so a header attributing itself to nobody is
  // refused rather than read anonymously.
  if (!nonEmptyString(publisherId)) return failed('header-missing-publisher-id')
  if (typeof publishedAt !== 'number') return failed('header-missing-published-at')
  if (typeof note !== 'string') return failed('header-missing-note')
  if (type !== 'prebuilt' && type !== 'dynamic') return failed('header-unknown-type')
  if (!nonEmptyString(name)) return failed('header-missing-name')
  if (!isRecord(attributes)) return failed('header-missing-attributes')
  // **The order is not optional and not cosmetic.** It is what maps values onto parameters, so a
  // header without it is one whose component cannot be called correctly — and calling it anyway
  // would put the right values in the wrong places with every signature valid.
  if (!isStringArray(attributeOrder)) return failed('header-missing-attribute-order')

  return {
    ok: true,
    value: { uid, publicationId, publisherId, publishedAt, note, type, name, attributes, attributeOrder }
  }
}

/**
 * Refuses a header that is not the publication the page pinned.
 *
 * The same check the executable gets, and for the same reason: whoever can write to storage can move
 * a **genuine, correctly signed** header of an older publication onto the path a newer one occupies.
 * Every signature involved stays valid; only comparing what the page pinned against what the
 * document says it is catches it.
 */
const matchesPin = (
  header: PublishedComponentHeader,
  expected: { uid: string, publicationId: string }
): Read<PublishedComponentHeader> => {
  if (header.uid !== expected.uid) {
    return failed(`header-wrong-component: expected ${expected.uid}, found ${header.uid}`)
  }
  if (header.publicationId !== expected.publicationId) {
    return failed(`header-wrong-publication: expected ${expected.publicationId}, found ${header.publicationId}`)
  }
  return { ok: true, value: header }
}

/**
 * Refuses a header and an executable that did not come from the same publication.
 *
 * **This is the binding R1 asks for, and it is not implied by the two pin checks.** They are fetched
 * and cached separately, so a consumer can hold a correctly signed header from one publication and a
 * correctly signed executable from another — the shapes disagree, the executable is called with the
 * wrong parameter list, and nothing in either document is invalid. Comparing them to each other is
 * what closes it.
 *
 * Stated as its own function rather than folded into the caller because it is the property most
 * likely to be quietly dropped: every test of the happy path passes without it.
 */
const sharesPublication = (
  header: PublishedComponentHeader,
  executable: { uid: string, publicationId: string }
): Read<PublishedComponentHeader> => {
  if (header.uid !== executable.uid) {
    return failed(
      `component-mismatched-documents: the header describes ${header.uid} and the executable ` +
      `belongs to ${executable.uid}`
    )
  }
  if (header.publicationId !== executable.publicationId) {
    return failed(
      `component-mismatched-publications: the header is from publication ${header.publicationId} ` +
      `and the executable from ${executable.publicationId}`
    )
  }
  return { ok: true, value: header }
}

export {
  HEADER_DOCUMENT,
  readHeader,
  matchesPin,
  sharesPublication
}

export type { PublishedComponentHeader, ComponentType }
