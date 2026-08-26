import type { SignedComponentHeader } from './header'
import type { SignedComponentExecutable } from '../executable/executable'
import type { PublishedComponent } from './types'

import { join } from 'path'
import {
  defaultBucketId,
  deleteDirectory,
  listOrCreateDirectory,
  fullyQualifiedNameToFilename,
  uploadInternalObjectJSON,
  getInternalObjectFlatted,
  uploadInternalObjectFlatted
} from '$lib/script/storage/storage.server'
import { isPreconditionFailed } from '@genoacms/cloudabstraction/storage'
import { validator } from '@exodus/schemasafe'
import { publishedComponentSchema } from './schemas'

/**
 * Where publications live, and the rule that each is written exactly once.
 *
 * ```
 * .genoacms/components/public/{uid}/{publicationId}/header.json
 * .genoacms/components/public/{uid}/{publicationId}/executable.json   (dynamic only)
 * .genoacms/components/publications/{uid}.json                        (the mutable pointer)
 * ```
 *
 * One directory per publication rather than one object per document, so that the pair belongs
 * together in the layout as well as in the payloads. A consumer resolving a pinned publication reads
 * one prefix and finds everything that publication is.
 *
 * The executable used to live at `dynamic/executables/{uid}/{publicationId}.json`, under the source
 * it was built from. That said a publication was a fact about *code*; it is a fact about a component,
 * and a prebuilt component publishes here too.
 *
 * ## Written once, never rewritten
 *
 * A consumer caches by path and never revalidates, because the path names a publication and a
 * publication does not change. That is only safe if the path is genuinely immutable — a rewritten
 * document would be served from caches as the old one indefinitely, and both would verify, since
 * both are properly signed. A stale document that verifies is worse than one that does not.
 *
 * So both writes are conditional on absence. A publication identifier is minted once, so a collision
 * is not a retry: it means either that this publication already exists or that two instances built
 * it. Both are conditions to stop on, not to overwrite through.
 *
 * Written as plain JSON rather than the flatted form the editor's own objects use, because a
 * consumer parses this with `JSON.parse` and verifies the bytes. A format only this CMS can read
 * would make the artifact unverifiable outside it. **The pointer is the exception** — it is internal,
 * never published, and never signed.
 */

const publicPath = join('.genoacms', 'components', 'public')
const pointerPath = join('.genoacms', 'components', 'publications')

const publicationDirectory = (uid: string, publicationId: string): string =>
  join(publicPath, uid, publicationId)

const publishedHeaderPath = (uid: string, publicationId: string): string =>
  join(publicationDirectory(uid, publicationId), 'header.json')

const publishedExecutablePath = (uid: string, publicationId: string): string =>
  join(publicationDirectory(uid, publicationId), 'executable.json')

const publishedComponentPath = (uid: string): string => join(pointerPath, `${uid}.json`)

/** Raised instead of overwriting a published document. */
class PublicationExistsError extends Error {
  constructor (readonly path: string) {
    super(
      `components/publication-exists: ${path} is already published. A publication is never ` +
      'rewritten, because consumers cache it by path and would keep serving whichever version ' +
      'they fetched first.'
    )
    this.name = 'PublicationExistsError'
  }
}

const writeOnce = async (path: string, document: unknown): Promise<void> => {
  try {
    await uploadInternalObjectJSON(path, document, { ifAbsent: true })
  } catch (error) {
    // Only a failed precondition means "already there". Anything else is a storage failure and has
    // to propagate, or an unreachable bucket would read as a published document. Matched by the
    // shared predicate rather than `instanceof`, because an adapter may hold its own copy of the
    // module the error class comes from.
    if (isPreconditionFailed(error)) throw new PublicationExistsError(path)
    throw error
  }
}

const uploadPublishedHeader = async (envelope: SignedComponentHeader): Promise<void> => {
  const { uid, publicationId } = envelope.payload
  await writeOnce(publishedHeaderPath(uid, publicationId), envelope)
}

const uploadPublishedExecutable = async (envelope: SignedComponentExecutable): Promise<void> => {
  const { uid, publicationId } = envelope.payload
  await writeOnce(publishedExecutablePath(uid, publicationId), envelope)
}

/**
 * Records which publication is the latest.
 *
 * Rewritten rather than written once, and deliberately so: it is a pointer, not a publication. It is
 * never served to a consumer and never signed, so nothing caches it and nothing verifies it.
 */
const uploadPublishedComponent = async (record: PublishedComponent): Promise<void> => {
  await uploadInternalObjectFlatted(publishedComponentPath(record.uid), record)
}

const validatePublishedComponent = validator(publishedComponentSchema)

/**
 * What a component last published, or `null` if it never has.
 *
 * Absence is an ordinary answer — most components have never been published — so a missing object
 * is `null` rather than an error. A record that exists but does not validate **is** an error: it
 * would otherwise read as "never published" and the next publication would be refused or allowed on
 * the strength of a comparison against nothing.
 */
const getPublishedComponent = async (uid: string): Promise<PublishedComponent | null> => {
  let stored
  try {
    stored = await getInternalObjectFlatted(publishedComponentPath(uid))
  } catch {
    return null
  }
  if (!validatePublishedComponent(stored)) {
    throw Error(`Invalid publication record for component ${uid}`)
  }
  return stored as PublishedComponent
}

/**
 * Removes every publication a component ever made, and the pointer to the latest.
 *
 * The counterpart to writing them once: because each publication has its own prefix and none is
 * rewritten, a deleted component leaves one signed, independently verifiable directory per
 * publication behind unless the whole tree goes. Nothing downstream would notice they belong to a
 * component that no longer exists.
 *
 * A component that was never published has neither, which is an ordinary state and tolerated. Any
 * other failure propagates, because reporting a deletion that did not happen is the defect this
 * replaces.
 */
const deleteComponentPublications = async (uid: string): Promise<void> => {
  await Promise.all([
    tolerateMissing(() => deleteDirectory({ bucket: defaultBucketId, name: join(publicPath, uid) })),
    tolerateMissing(() => deleteDirectory({ bucket: defaultBucketId, name: publishedComponentPath(uid) }))
  ])
}

const tolerateMissing = async (removal: () => Promise<unknown>): Promise<void> => {
  try {
    await removal()
  } catch (error) {
    if (!isMissing(error)) throw error
  }
}

/** Object storage has no directories, so removing one that holds nothing is not an error. */
const isMissing = (error: unknown): boolean => (error as { code?: number })?.code === 404

/**
 * Every component that has published something, by uid.
 *
 * **One listing, not one read per component.** The page editor asks "which of these may be composed
 * with" on every load, and answering it by fetching each component's pointer record is a round trip
 * per component in the catalog — which grows with the catalog and lands on the path an author waits
 * on. The pointers all live in one directory, and its filenames *are* the uids, so the whole answer
 * is one listing.
 *
 * Only the names are read. The records hold a publication identifier and a digest, and neither is
 * needed to answer whether something has been published — reading them would put the N back.
 */
const listPublishedComponentUids = async (): Promise<Set<string>> => {
  // The trailing slash is what makes this a *directory* to the storage abstraction — without it the
  // listing comes back empty rather than failing, and an empty listing here reads as "nothing has
  // been published", which is an ordinary state. So the mistake is invisible at this layer and
  // surfaces as a page editor that offers nothing.
  const listing = await listOrCreateDirectory({ bucket: defaultBucketId, name: `${pointerPath}/` })
  const uids = listing.files
    .map(file => fullyQualifiedNameToFilename(file.name))
    .filter(name => name.endsWith('.json'))
    .map(name => name.slice(0, -'.json'.length))
  return new Set(uids)
}

export {
  publicationDirectory,
  listPublishedComponentUids,
  publishedHeaderPath,
  publishedExecutablePath,
  publishedComponentPath,
  uploadPublishedHeader,
  uploadPublishedExecutable,
  uploadPublishedComponent,
  getPublishedComponent,
  deleteComponentPublications,
  PublicationExistsError
}
