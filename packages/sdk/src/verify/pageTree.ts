import type { JsonValue } from './canonical.js'

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
   * Which component this is, for one authored in the CMS.
   *
   * Present exactly when `publicationId` is. Together they name the artifact: executables are published
   * at `{uid}/{publicationId}`, so either alone is a pin that cannot be resolved.
   */
  uid?: string
  /**
   * The revision this node was pinned to, for a component authored in the CMS.
   *
   * Absent for a prebuilt component, whose code is in the consuming application and which the CMS
   * therefore has no revision of. Absent, not empty — the two are different documents once signed.
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
 * reach the executable lookup as something that is neither a revision nor a prebuilt node.
 */
const readNode = (candidate: JsonValue): Read<ReadablePageNode> => {
  if (!isRecord(candidate)) return failed('node-not-an-object')

  const { component, uid, publicationId, data } = candidate
  if (typeof component !== 'string' || component.length === 0) return failed('node-missing-component')
  if (publicationId !== undefined && typeof publicationId !== 'string') return failed('node-commit-id-not-a-string')
  if (uid !== undefined && typeof uid !== 'string') return failed('node-uid-not-a-string')
  // Either alone is a pin nobody can resolve: an artifact is at `{uid}/{publicationId}`. Refused rather
  // than treated as prebuilt, because a node that names a revision is asking for one to be run.
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

/** What a tree pins, in the order met — enough to fetch each. Prebuilt nodes contribute nothing. */
const pinnedRevisions = (root: ReadablePageNode): Array<{ uid: string, publicationId: string }> =>
  [...walkTree(root)]
    .filter((node): node is ReadablePageNode & { uid: string, publicationId: string } =>
      node.uid !== undefined && node.publicationId !== undefined)
    .map(node => ({ uid: node.uid, publicationId: node.publicationId }))

export { PAGE_TREE_DOCUMENT, readPageTree, readNode, walkTree, pinnedRevisions }
export type { ReadablePageNode, ReadableAttributeValue, Read }
