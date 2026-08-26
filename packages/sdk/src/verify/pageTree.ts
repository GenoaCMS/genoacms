import type { JsonValue } from './canonical.js'
// The same vocabulary the publication uses, imported rather than restated. A node's `type` is a
// claim about the component's kind and the publication is the signed answer to it — two spellings of
// one union here would let the two drift and make the comparison between them unwritable.
import type { ComponentType } from './publication.js'

/**
 * The published page, as a consumer receives it.
 *
 * This is a **re-statement** of the shape the CMS publishes, not an import of it. The SDK is
 * installed by applications that have no reason to depend on the CMS, and the document is a
 * published format rather than an internal type — so it is described here, from the outside, in the
 * terms a consumer sees.
 *
 * ## Read only what has been verified
 *
 * Nothing here is reached before a signature has been checked. The reader takes a payload the
 * verifier has already accepted, and exists to say what that payload has to look like before a
 * renderer walks it — because a valid signature over a malformed tree is still a malformed tree, and
 * an attacker who compromised the signing key produces exactly that.
 */

const PAGE_TREE_DOCUMENT = 'genoacms.pageTree.v1'

type ReadableAttributeValue =
  | boolean
  | number
  | string
  | string[]
  | ReadablePageNode[]

interface ReadablePageNode {
  /** The component's name. For a prebuilt node, what the consumer resolves against its own map. */
  component: string
  /**
   * Which kind of component this is.
   *
   * **Stated by the node, not inferred from what is present.** A prebuilt node used to be the one
   * with no pin; both kinds are pinned now, because a prebuilt component publishes a signed
   * description even though its code stays in the consuming application. Absence therefore
   * distinguishes nothing, and this says which of the two to expect at the publication.
   *
   * A consumer must still check it against the **signed publication**, which says the same thing
   * under a signature. The two are separate documents and only one of them is this one.
   */
  type: ComponentType
  /**
   * Which component this is.
   *
   * Present exactly when `publicationId` is. Together they name the publication: documents are
   * published at `{uid}/{publicationId}`, so either alone is a pin that cannot be resolved.
   */
  uid?: string
  /**
   * The publication this node was pinned to.
   *
   * Absent for a component that was never published, which is a node nothing can be fetched for.
   * Absent, not empty — the two are different documents once signed.
   */
  publicationId?: string
  data: Record<string, ReadableAttributeValue>
}

/**
 * Read, or the reason it could not be.
 *
 * A discriminated result rather than "the value, or a string explaining the problem": a string is a
 * perfectly ordinary attribute value, so the two would be indistinguishable and a component whose
 * heading happened to read `node-not-an-object` would be rejected.
 */
type Read<T> =
  | { ok: true, value: T }
  | { ok: false, reason: string }

const failed = (reason: string): Read<never> => ({ ok: false, reason })

const isRecord = (value: unknown): value is Record<string, JsonValue> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const readAttributeValue = (value: JsonValue): Read<ReadableAttributeValue> => {
  if (typeof value === 'boolean' || typeof value === 'number' || typeof value === 'string') {
    return { ok: true, value }
  }
  if (!Array.isArray(value)) return failed('node-attribute-not-a-value')

  // Links and storage resources resolve to lists of URLs; a slot resolves to a list of nodes. An
  // empty array is both and neither, and reading it as a list of strings is safe because both render
  // as nothing.
  if (value.every(member => typeof member === 'string')) {
    return { ok: true, value: value as string[] }
  }

  const nodes: ReadablePageNode[] = []
  for (const member of value) {
    const node = readNode(member)
    if (!node.ok) return node
    nodes.push(node.value)
  }
  return { ok: true, value: nodes }
}

/**
 * Reads one node, refusing anything a renderer would have to guess about.
 *
 * `publicationId` is accepted only as a string or as absent. Present-but-not-a-string would otherwise
 * reach the publication lookup as something that is neither a pin nor an unpublished node.
 */
const readNode = (candidate: JsonValue): Read<ReadablePageNode> => {
  if (!isRecord(candidate)) return failed('node-not-an-object')

  const { component, type, uid, publicationId, data } = candidate
  if (typeof component !== 'string' || component.length === 0) return failed('node-missing-component')
  // Required, and not defaulted. Defaulting to `prebuilt` would make a node with the member stripped
  // out resolve against the consumer's local map instead of the code the CMS published for it, and
  // defaulting to `dynamic` would send a consumer looking for a bundle that was never meant to
  // exist. Neither guess is one a renderer should make on a signed document's behalf.
  if (type !== 'prebuilt' && type !== 'dynamic') return failed('node-unknown-type')
  if (publicationId !== undefined && typeof publicationId !== 'string') return failed('node-publication-id-not-a-string')
  if (uid !== undefined && typeof uid !== 'string') return failed('node-uid-not-a-string')
  // Either alone is a pin nobody can resolve: a publication is at `{uid}/{publicationId}`.
  if ((uid === undefined) !== (publicationId === undefined)) return failed('node-half-pinned')
  if (!isRecord(data)) return failed('node-missing-data')

  const read: Record<string, ReadableAttributeValue> = {}
  for (const [name, value] of Object.entries(data)) {
    const attribute = readAttributeValue(value)
    if (!attribute.ok) return failed(`${attribute.reason} (at '${name}')`)
    read[name] = attribute.value
  }

  return {
    ok: true,
    value: {
      component,
      type,
      // Omitted rather than set to undefined, so what is read back matches what was signed.
      ...(uid === undefined ? {} : { uid }),
      ...(publicationId === undefined ? {} : { publicationId }),
      data: read
    }
  }
}

/** Reads a verified payload as a page tree, or names what is wrong with it. */
const readPageTree = (payload: JsonValue): Read<ReadablePageNode> => readNode(payload)

/** Every node in a tree, parents before children. What a renderer and a prefetcher both walk. */
const walkTree = function * (root: ReadablePageNode): Generator<ReadablePageNode> {
  yield root
  for (const value of Object.values(root.data)) {
    if (!Array.isArray(value)) continue
    for (const member of value) {
      if (typeof member === 'string') continue
      yield * walkTree(member)
    }
  }
}

/**
 * What a node asks a verifier to fetch, and what it claims to be.
 *
 * The `type` travels with the pin so that the verifier can compare the page's claim against the
 * publication's own signed one. Both are signed, by different documents, at different times — and it
 * is the disagreement between them that says something has been moved.
 */
interface PublicationPin {
  uid: string
  publicationId: string
  type: ComponentType
}

/**
 * What a tree pins, in the order met — enough to fetch each.
 *
 * **Both kinds are included now.** A prebuilt node used to contribute nothing, because there was
 * nothing published for it; there is now a signed header saying what it accepts, and a consumer that
 * skipped it would go on calling such a component from an unsigned local assumption about its
 * parameter order.
 *
 * A node that was never published contributes nothing, because there is no publication to name.
 */
const pinnedPublications = (root: ReadablePageNode): PublicationPin[] =>
  [...walkTree(root)]
    .filter((node): node is ReadablePageNode & { uid: string, publicationId: string } =>
      node.uid !== undefined && node.publicationId !== undefined)
    .map(node => ({ uid: node.uid, publicationId: node.publicationId, type: node.type }))

export { PAGE_TREE_DOCUMENT, readPageTree, readNode, walkTree, pinnedPublications }
export type { ReadablePageNode, ReadableAttributeValue, PublicationPin, Read }
