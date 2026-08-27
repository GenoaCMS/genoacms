import type { JsonValue } from './canonical.js'
import type { Read } from './pageTree.js'

/**
 * A published component: what it accepts, and the code to run if it has any.
 *
 * Re-stated from the published format rather than imported from the CMS, for the reason the page
 * tree is: this is what an application receives, and an application has no reason to depend on the
 * thing that produced it.
 *
 * ## One document, where there were two
 *
 * A publication used to arrive as a header and an executable, signed separately and fetched
 * separately. Both could be genuine and still not belong together — a correctly signed description
 * from one release beside correctly signed code from another, the shapes disagreeing, the bundle
 * called with the wrong parameter list, and neither document invalid. A `sharesPublication` check
 * existed to catch exactly that, and it was the kind of check every test of the happy path passes
 * without.
 *
 * **That check is gone because the pairing is gone.** One document cannot be paired with itself
 * wrongly. What remains of the property is a *shape* rule, enforced by the reader below: a prebuilt
 * component's payload carries no bundle, a dynamic one's carries at least one. Those two used to be
 * cross-document failures discovered after two fetches and two verifications; they are now malformed
 * payloads discovered before anything is run.
 *
 * ## What is checked, and in what order
 *
 * The signature comes first and is not this file's business. What is left afterwards are the things
 * a valid signature does not settle:
 *
 * - **Is it shaped like a publication at all?** A signature attests to bytes, not to their shape.
 *   Whoever holds the signing key can sign a malformed payload, and that is precisely what a
 *   compromised key produces.
 * - **Is this the publication the page asked for?** A genuine, correctly signed release of an older
 *   publication can be moved onto the path a newer one occupies. Every signature stays valid; only
 *   comparing what the page pinned against what the document says it is catches it.
 * - **Can this runtime execute it?** A bundle built for another platform is a correctly signed
 *   artifact meant for somebody else, not a corrupted one.
 *
 * ## Why the description is signed at all
 *
 * A signed bundle attests to *what a component does*. It says nothing about what the component
 * **accepts** — the parameter list is emitted from the description, so an unsigned one is something
 * anyone between the CMS and the consumer may rewrite. The bundle would still verify, and would be
 * called with the right values in the wrong parameters. Nothing about the code could reveal it.
 *
 * It is also the whole of what a **prebuilt** component publishes. Such a component's code lives in
 * the consuming application, so its description is the entire artifact, and `attributeOrder` is the
 * only thing that says which of the host's parameters receives which value.
 */

const PUBLICATION_DOCUMENT = 'genoacms.componentPublication.v1'

/** What this SDK can run. Executing an ES module needs an ES module host and nothing else does. */
const WEB_ESMODULE = 'web-esmodule'

/** Whether the component's code is published here or lives in the consuming application. */
type ComponentType = 'prebuilt' | 'dynamic'

/** One compiled bundle, for one target. */
interface PublishedExecutable {
  /** The target this bundle was built for. */
  platform: string
  /** The bundle itself, ready to execute. */
  executableCode: string
  /** When the server compiled it. A different fact from `publishedAt`, which is when a person released it. */
  compiledAt: number
}

interface ComponentPublication {
  /** The component this describes. */
  uid: string
  /** The release it came from. What a page pins. */
  publicationId: string
  /** The principal who published it. Attribution, and the audit trail. */
  publisherId: string
  publishedAt: number
  /** The publisher's own account of the release. */
  note: string
  /** Whether to expect code here. */
  type: ComponentType
  /** What a person calls it, and how a prebuilt component is resolved against the host's map. */
  name: string
  /**
   * The attributes, by reference.
   *
   * Read only for each attribute's **name** — see `attributeNames`, which is what connects this to a
   * page's `data`. Everything else in an attribute is the CMS's validation vocabulary and is passed
   * over: a renderer receives values that have already been resolved, and re-checking a constraint
   * the CMS enforced would be a second opinion nobody asked for.
   */
  attributes: Record<string, JsonValue>
  /** **The order the attributes are passed in.** Without it the values have no destination. */
  attributeOrder: string[]
  /**
   * The compiled bundles, one per target.
   *
   * Absent — not empty — for a prebuilt component. A publication carrying several targets is one
   * release compiled more than once, which is why a page pins a publication and never a platform.
   */
  executables?: PublishedExecutable[]
}

const failed = (reason: string): Read<never> => ({ ok: false, reason })

const isRecord = (value: unknown): value is Record<string, JsonValue> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const nonEmptyString = (value: JsonValue | undefined): value is string =>
  typeof value === 'string' && value.length > 0

const isStringArray = (value: JsonValue | undefined): value is string[] =>
  Array.isArray(value) && value.every(entry => typeof entry === 'string')

/** Reads one bundle, refusing anything a runtime would have to guess about. */
const readExecutable = (candidate: JsonValue): Read<PublishedExecutable> => {
  if (!isRecord(candidate)) return failed('executable-not-an-object')

  const { platform, executableCode, compiledAt } = candidate

  if (!nonEmptyString(platform)) return failed('executable-missing-platform')
  if (typeof compiledAt !== 'number') return failed('executable-missing-compiled-at')
  // Empty code is not a bundle with nothing in it — it is a component that renders nothing while
  // carrying a signature saying it was meant to.
  if (!nonEmptyString(executableCode)) return failed('executable-missing-code')

  return { ok: true, value: { platform, executableCode, compiledAt } }
}

/**
 * Reads the list of bundles, and refuses one that contradicts the declared kind.
 *
 * **These are the two refusals the merge inherited.** They used to be answers about a *pair* — a
 * bundle sitting beside a prebuilt description, a dynamic description with no bundle beside it — and
 * could only be reached after fetching and verifying two documents. They are now answers about one
 * payload's shape.
 *
 * Refused rather than reconciled, in both directions. A prebuilt component's code is the consuming
 * application's, so a bundle here is either a description that was swapped or code nobody asked for;
 * choosing which document to believe would be guessing. A dynamic component with no bundle is a
 * release that renders nothing, and it is kept apart from "nothing is published here", which the
 * caller reads as an unpublished component.
 */
const readExecutables = (
  type: ComponentType,
  candidate: JsonValue | undefined
): Read<PublishedExecutable[] | undefined> => {
  if (type === 'prebuilt') {
    if (candidate !== undefined) {
      return failed(
        'publication-unexpected-executables: this component is prebuilt, so its code lives in the ' +
        'consuming application, yet the publication carries a bundle'
      )
    }
    return { ok: true, value: undefined }
  }

  if (!Array.isArray(candidate)) return failed('publication-missing-executables')
  if (candidate.length === 0) return failed('publication-missing-executables')

  const executables: PublishedExecutable[] = []
  for (const member of candidate) {
    const read = readExecutable(member)
    if (!read.ok) return read
    executables.push(read.value)
  }

  // Two bundles for one target do not say which to run, and whichever a consumer picked would be
  // signed — so nothing downstream could report the ambiguity. Refused here instead.
  const platforms = new Set(executables.map(executable => executable.platform))
  if (platforms.size !== executables.length) {
    return failed('publication-duplicate-platforms: several bundles claim the same target')
  }

  return { ok: true, value: executables }
}

/** Reads a verified payload as a publication, or names what is wrong with it. */
const readPublication = (payload: JsonValue): Read<ComponentPublication> => {
  if (!isRecord(payload)) return failed('publication-not-an-object')

  const {
    uid, publicationId, publisherId, publishedAt, note, type, name, attributes, attributeOrder
  } = payload

  if (!nonEmptyString(uid)) return failed('publication-missing-uid')
  if (!nonEmptyString(publicationId)) return failed('publication-missing-publication-id')
  // Attribution is what makes the audit trail real, so a publication attributing itself to nobody is
  // refused rather than read anonymously.
  if (!nonEmptyString(publisherId)) return failed('publication-missing-publisher-id')
  if (typeof publishedAt !== 'number') return failed('publication-missing-published-at')
  if (typeof note !== 'string') return failed('publication-missing-note')
  if (type !== 'prebuilt' && type !== 'dynamic') return failed('publication-unknown-type')
  if (!nonEmptyString(name)) return failed('publication-missing-name')
  if (!isRecord(attributes)) return failed('publication-missing-attributes')
  // **The order is not optional and not cosmetic.** It is what maps values onto parameters, so a
  // publication without it is one whose component cannot be called correctly — and calling it anyway
  // would put the right values in the wrong places with every signature valid.
  if (!isStringArray(attributeOrder)) return failed('publication-missing-attribute-order')

  const executables = readExecutables(type, payload.executables)
  if (!executables.ok) return executables

  return {
    ok: true,
    value: {
      uid,
      publicationId,
      publisherId,
      publishedAt,
      note,
      type,
      name,
      attributes,
      attributeOrder,
      // Omitted rather than set to undefined, so what is read back matches what was signed.
      ...(executables.value === undefined ? {} : { executables: executables.value })
    }
  }
}

/**
 * Refuses a publication that is not the one the page pinned, or not the kind it said.
 *
 * Whoever can write to storage can move a **genuine, correctly signed** release of an older
 * publication onto the path a newer one occupies. Every signature involved stays valid; only
 * comparing what the page pinned against what the document says it is catches it.
 *
 * ## Why the kind is compared too
 *
 * The page tree and the publication both state it, under **different signatures made at different
 * times** — so they can disagree, and the disagreement is the finding. A page saying `prebuilt`
 * where the publication says `dynamic` means a consumer is about to render its own local component
 * under a name the CMS published code for; the reverse means it will look for a bundle the
 * publication never had. Neither is caught by verifying either document on its own.
 *
 * `expected.type` is optional because a caller that resolves a publication **without a page** — a
 * tool inspecting storage, a prefetcher given a uid — has no claim to compare against, and demanding
 * one would make it invent the answer it is checking.
 */
const matchesPin = (
  publication: ComponentPublication,
  expected: { uid: string, publicationId: string, type?: ComponentType }
): Read<ComponentPublication> => {
  if (publication.uid !== expected.uid) {
    return failed(`publication-wrong-component: expected ${expected.uid}, found ${publication.uid}`)
  }
  if (publication.publicationId !== expected.publicationId) {
    return failed(
      `publication-wrong-publication: expected ${expected.publicationId}, found ${publication.publicationId}`
    )
  }
  if (expected.type !== undefined && publication.type !== expected.type) {
    return failed(
      `publication-wrong-type: the page pinned a ${expected.type} component and the published ` +
      `document describes a ${publication.type} one`
    )
  }
  return { ok: true, value: publication }
}

/**
 * The bundle this runtime will execute, or the reason none of them will do.
 *
 * **Selects rather than refuses**, which is what changed when a publication became able to carry
 * several targets. A release compiled for a platform this consumer cannot run is not a broken
 * release; it is a release that also serves somebody else. Only a release with nothing this consumer
 * can run is an answer it has to stop on.
 *
 * Checked **after** verification, deliberately: an unrecognized platform is a correctly signed
 * artifact meant for another runtime rather than a corrupted one, and the two deserve different
 * answers.
 *
 * A prebuilt component resolves to no bundle and that is success, not absence — its code is the
 * consuming application's, and the publication was never going to carry any.
 */
const runnableOn = (
  publication: ComponentPublication,
  platforms: readonly string[] = [WEB_ESMODULE]
): Read<PublishedExecutable | undefined> => {
  if (publication.executables === undefined) return { ok: true, value: undefined }

  const runnable = publication.executables.find(
    executable => platforms.includes(executable.platform)
  )
  if (runnable === undefined) {
    const built = publication.executables.map(executable => executable.platform).join(', ')
    return failed(
      `publication-unsupported-platform: this SDK runs ${platforms.join(', ')}, ` +
      `and this publication was built for ${built}`
    )
  }
  return { ok: true, value: runnable }
}

/**
 * The name of each attribute, in the order the component's parameters take them.
 *
 * **This is what joins a publication to a page.** A publication states its parameter order as
 * attribute *references* — uids, which exist so that renaming an attribute in the CMS does not lose
 * the value already bound to it. A published page, meanwhile, keys each node's `data` by the
 * attribute's **name**, the one a person typed. So a renderer walks the order, turns each reference
 * into a name here, and looks the value up under it.
 *
 * The name is returned **exactly as it was signed**, because that is the key a page used. Two names
 * are compared with their ends trimmed, though, which is a slightly wider net than equality: `Body`
 * and `Body ` are different keys and the same name to anybody reading them.
 *
 * ## Why a duplicate is refused here as well
 *
 * The CMS refuses to save a component whose attributes share a name, for the reason this exists: the
 * page's `data` is keyed by name, so the second value overwrites the first as the tree is built, and
 * the tree is signed **afterwards**. One parameter silently receives another's value and every
 * signature is valid.
 *
 * A consumer checks it again anyway. Publications are immutable and a page pins one, so a release
 * made before the CMS enforced this is still out there, still verifying, and still reachable — the
 * same reason this SDK refuses a bundle whose entry was never exported. A rule the producer enforces
 * protects documents made after it; a rule the consumer enforces protects the documents it is handed.
 */
const attributeNames = (publication: ComponentPublication): Read<string[]> => {
  const names: string[] = []
  const seen = new Set<string>()

  for (const reference of publication.attributeOrder) {
    const attribute = publication.attributes[reference]
    // The order names something the attributes do not describe, so one parameter has no name and
    // therefore no value. Calling the component anyway would leave every later argument in place and
    // this one undefined, with nothing to say which.
    if (!isRecord(attribute)) {
      return failed(`publication-unknown-attribute: the order names ${reference}, which is not described`)
    }
    const schema = attribute.schema
    if (!isRecord(schema)) return failed(`publication-attribute-missing-schema: ${reference}`)
    if (typeof schema.title !== 'string') {
      return failed(`publication-attribute-unnamed: ${reference} has no name to look a value up by`)
    }

    const name = schema.title
    if (seen.has(name.trim())) {
      return failed(
        `publication-duplicate-attribute-name: two attributes are named "${name.trim()}", so a ` +
        'page stores one value where two belong'
      )
    }
    seen.add(name.trim())
    names.push(name)
  }

  return { ok: true, value: names }
}

export {
  PUBLICATION_DOCUMENT,
  WEB_ESMODULE,
  readPublication,
  matchesPin,
  runnableOn,
  attributeNames
}

export type { ComponentPublication, PublishedExecutable, ComponentType }
