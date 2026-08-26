import type { ComponentHeader } from '../componentHeader/component/types'
import type { ComponentDefinition } from '../editor/types'
import type { ComponentShape } from '@genoacms/internal/languageAdapter'
import type { SignedComponentExecutable } from '../executable/executable'
import type { SignedComponentHeader } from './header'
import type { ComponentPublicationOrder, PublishedComponent } from './types'

import { getComponentHeader, listOrCreateComponentHeaderList } from '../componentHeader/io.server'
import { getComponentDefiniton } from '../editor/io'
import { updateComponentDefinition } from '../editor/index'
import { analyzeComponentBody, compileComponentBody, signatureFor } from '../editor/compilation'
import { signComponentExecutable } from '../executable/executable.server'
import { signComponentHeader } from './header.server'
import { describingDigest } from './header'
import {
  getPublishedComponent,
  listPublishedComponentUids,
  uploadPublishedComponent,
  uploadPublishedExecutable,
  uploadPublishedHeader
} from './io.server'
import { ComponentDiffError, NoSuchComponentError } from '../editor/errors'

/**
 * Publishing a component.
 *
 * **One act for both kinds**, which is the governing idea of the whole rework reaching the release
 * path: a prebuilt component and a dynamic one differ only in that the dynamic one also has
 * executable code. So publishing always signs a header, and additionally compiles and signs an
 * executable when there is code to compile. There is no second pipeline for the second kind, and no
 * branch anywhere except the one that asks whether code exists.
 *
 * This module lives outside `editor/` on purpose. Publication used to be the editor's, because only
 * dynamic components had one; an act a prebuilt component performs cannot be owned by the surface
 * that edits source, and leaving it there is what made a prebuilt component unpublishable.
 *
 * ## The order is the point
 *
 * Everything that can refuse runs before anything is written — reading, the no-change rule, static
 * analysis, compilation and both signatures. A component that does not analyze, does not compile or
 * cannot be signed leaves the bucket exactly as it was, so a rejected publication is something to
 * fix rather than something to recover from. Writing as each stage succeeded would leave a
 * publication directory holding a header and no executable, which verifies and serves nothing.
 */

/** Everything a publication is built from, read together because none of it is useful alone. */
interface PublicationSubject {
  header: ComponentHeader
  /** Absent for a prebuilt component, which has no code. That absence is the only branch here. */
  definition: ComponentDefinition | undefined
  published: PublishedComponent | null
}

const readSubject = async (componentId: string): Promise<PublicationSubject> => {
  const header = await getComponentHeader(componentId)
  if (header === null) {
    throw new NoSuchComponentError(componentId, `components/no-such-component: ${componentId} does not exist.`)
  }
  const [definition, published] = await Promise.all([
    header.type === 'dynamic' ? getComponentDefiniton(componentId) : undefined,
    getPublishedComponent(componentId)
  ])
  return { header, definition, published }
}

/** The shape the component is published with: the one the registrar holds, never one read from code. */
const shapeOf = (header: ComponentHeader): ComponentShape => ({
  attributes: header.attributes,
  attributeOrder: header.attributeOrder
})

/**
 * Whether there is anything to publish.
 *
 * Three things can have moved, and a publication is warranted if any of them has:
 *
 * - the **header**, compared by the canonical digest of its describing half. This is the whole of
 *   the rule for a prebuilt component, and it is what makes a prebuilt component publishable at all.
 * - the **body**, against what the last publication compiled.
 * - the **signature** the body is wrapped in, which is emitted from the shape. Compared through the
 *   emitted text rather than through the stored attributes, because that is the shape's entire
 *   contribution to what gets compiled — so it cannot drift from what is actually built, and an edit
 *   that changes a description without changing what compiles does not count as a code change.
 *
 * The signature check is not redundant with the header digest even though both derive from the
 * shape: the digest also moves when a name or a description changes, and the emitted signature is
 * what says whether the *executable* would differ. Keeping them apart is what lets the refusal
 * message say which of the two is the reason.
 */
const hasChanged = async (subject: PublicationSubject): Promise<boolean> => {
  const { header, definition, published } = subject
  if (published === null) return true
  if (published.headerDigest !== describingDigest(header)) return true
  if (definition === undefined) return false

  if (definition.body !== definition.publishedBody) return true
  const { text } = await signatureFor(definition.language, shapeOf(header))
  return text !== definition.publishedSignature
}

const requireSomethingToPublish = async (subject: PublicationSubject): Promise<void> => {
  if (await hasChanged(subject)) return
  throw new ComponentDiffError(
    'no-change',
    'Nothing has changed since the last publication: neither the component\'s description nor, ' +
    'where it has one, its code.'
  )
}

interface BuiltPublication {
  header: SignedComponentHeader
  /** Present exactly when the component is dynamic. */
  executable: SignedComponentExecutable | undefined
  /** The signature the executable was compiled around, recorded so the next rule can compare it. */
  signature: string | undefined
}

/**
 * Compiles and signs everything, and writes nothing.
 *
 * The executable is built from the draft `body`. There is no separate committed state to publish
 * from: a draft is saved on every edit that lands, so what an author is looking at is what the
 * bucket holds, and publishing it is publishing what they meant.
 */
const build = async (
  subject: PublicationSubject,
  publicationId: string,
  publisherId: string,
  publishedAt: number,
  note: string
): Promise<BuiltPublication> => {
  const { header, definition } = subject
  const signedHeader = await signComponentHeader(
    { publicationId, publisherId, publishedAt, note },
    header
  )
  if (definition === undefined) {
    return { header: signedHeader, executable: undefined, signature: undefined }
  }

  const shape = shapeOf(header)
  await analyzeComponentBody(definition.language, definition.body, shape)
  const compiled = await compileComponentBody(definition.language, definition.body, shape)
  // Taken from the adapter rather than rebuilt here, so it is the same text the bundle was compiled
  // around and not a second emitter's opinion of it.
  const { text: signature } = await signatureFor(definition.language, shape)
  const executable = await signComponentExecutable(
    { uid: header.uid, publicationId, publisherId, publishedAt },
    compiled.platform,
    compiled.executableCode
  )
  return { header: signedHeader, executable, signature }
}

/**
 * Writes what was built.
 *
 * **The signed documents first, the pointers after.** Object storage has no transaction, so the
 * writes cannot be one act; what can be chosen is which failure is survivable. A publication
 * directory nothing points at is unreferenced and harmless — the next publication supersedes it. A
 * pointer advanced past documents that were never written is a component that reports a publication
 * nothing can serve.
 *
 * Within the documents, the executable goes first. A header alone describes a component that has no
 * code to run; an executable alone is an artifact nothing can call, and a consumer resolving the
 * directory reads the header to learn whether to expect the other. Writing the header last means the
 * pair is never observably half-formed in the direction that matters.
 */
const store = async (
  subject: PublicationSubject,
  built: BuiltPublication,
  record: PublishedComponent
): Promise<void> => {
  if (built.executable !== undefined) await uploadPublishedExecutable(built.executable)
  await uploadPublishedHeader(built.header)

  await Promise.all([
    uploadPublishedComponent(record),
    advanceDefinition(subject, built)
  ])
}

/**
 * Records on the definition what the publication compiled.
 *
 * Only for a dynamic component, and only the code half: the body that was built and the signature it
 * was built against are what `no change, no publication` compares next time, and neither can be
 * recovered from the header.
 *
 * **The publication identifier is not recorded here.** The definition used to keep a copy of it for
 * a page build to pin, which meant one fact in two places — and the copy could only ever answer for
 * a dynamic component, so a prebuilt one had no pin at all. The pointer record holds it for both.
 */
const advanceDefinition = async (
  subject: PublicationSubject,
  built: BuiltPublication
): Promise<void> => {
  const { definition } = subject
  if (definition === undefined || built.signature === undefined) return
  await updateComponentDefinition(definition.uid, d => {
    d.publishedBody = definition.body
    d.publishedSignature = built.signature as string
    return d
  }, definition)
}

/**
 * Publishes a component: read, refuse, analyze, compile, sign, write.
 *
 * `publisherId` is a parameter rather than something read here, because this module has no
 * principal: the authenticated subject arrives from `user.server.ts`. It is carried into both signed
 * documents so each artifact names who released it.
 */
const publishComponent = async (
  order: ComponentPublicationOrder,
  publisherId: string
): Promise<PublishedComponent> => {
  const subject = await readSubject(order.componentId)
  await requireSomethingToPublish(subject)

  const publicationId = crypto.randomUUID()
  const publishedAt = Date.now()
  const built = await build(subject, publicationId, publisherId, publishedAt, order.note)

  const record: PublishedComponent = {
    uid: subject.header.uid,
    publicationId,
    publisherId,
    publishedAt,
    note: order.note,
    headerDigest: describingDigest(subject.header)
  }
  await store(subject, built, record)
  return record
}

/**
 * The components a page may be composed from: those that have been published.
 *
 * **R3.** A page is built against a component's shape, and a shape nobody has published is one no
 * consumer can verify — so composing from it produces a page whose nodes name a publication that
 * does not exist. Refusing at render time would be discovering it too late; the editor is where the
 * choice is made, so the editor is where the choice is narrowed.
 *
 * A filter over the whole catalog rather than a listing of the publication directory, because the
 * **header** is what the editor needs and the pointer record holds no shape. The publications are
 * read as a *set of uids* — two listings, not one listing and a read per component. The page editor
 * asks this on every load, so an answer costing a round trip per component in the catalog would get
 * slower as the catalog grew, on the path an author waits on.
 *
 * This does not decide which shape a node is built from. That stays the header the registrar holds,
 * so an author editing a published component's description still sees their edits in the page
 * editor — what is gated here is whether the component may be *introduced* to a page at all.
 */
const listComposableComponentHeaders = async (): Promise<ComponentHeader[]> => {
  const [headers, published] = await Promise.all([
    listOrCreateComponentHeaderList(),
    listPublishedComponentUids()
  ])
  return headers.filter(header => published.has(header.uid))
}

export { publishComponent, getPublishedComponent, listComposableComponentHeaders }
export type { PublishedComponent }

// Re-exported so callers have one import for the concept rather than reaching into storage.
export { deleteComponentPublications } from './io.server'
