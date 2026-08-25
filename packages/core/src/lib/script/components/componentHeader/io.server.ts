import type { ComponentHeader, ComponentHeaderReference } from './component/types'
import type { UndoRedoAdjunct } from '$lib/script/undoRedo/types'
import {
  defaultBucketId,
  listOrCreateDirectory,
  fullyQualifiedNameToFilename,
  uploadInternalObjectJSON,
  uploadInternalObjectFlatted,
  deleteInternalObject,
  getInternalObjectJSON,
  getInternalObjectFlatted
} from '$lib/script/storage/storage.server'
import { noHistory } from '$lib/script/undoRedo'
import { join } from 'path'
import { validator } from '@exodus/schemasafe'
import type { Json } from '@exodus/schemasafe'
import { componentHeaderSchema } from './component/schemas'

/**
 * Where a component's header is stored, and why it is two objects rather than one.
 *
 * ## `headers/`, because both kinds of component live here
 *
 * This directory was called `prebuilt/`, and that name was wrong from the moment dynamic components
 * gained a header: `createComponent` writes one for a dynamic component too, to this same place. So
 * a reader of the bucket saw a directory claiming to hold one kind of component while holding both,
 * and the type that actually distinguishes them was inside the objects rather than in the tree.
 *
 * `headers/` says what is there — every component's description, of either kind — and leaves the
 * distinction where it is decidable.
 *
 * **Nothing reads the old directory.** A component stored under `prebuilt/` is not found, not
 * listed, and not repaired — it has to be created again. This is a pre-release system with no
 * deployment and no stored data anyone is owed, so a fallback here would be a second storage path
 * kept under test for a caller that does not exist.
 *
 * A header is two objects, so
 * that each of the two is stored in the form its readers need:
 *
 * - **`{uid}.json`** — the description. Plain JSON, because this is what gets published and signed
 *   so a consumer can learn a component's attribute order, and a format only this CMS can read
 *   would make it unverifiable outside it.
 * - **`{uid}.history`** — the editing history, and nothing else. Flatted, because a history is
 *   mostly repetition: every diff's path carries attribute references, which are UUIDs, so the same
 *   36 characters recur in every step and flatted pools them. Measured at roughly 90% of the JSON
 *   size for realistic histories.
 *
 * The description is stored once, in one file. An envelope holding both would have put the current
 * state inside the history object, and publishing it would then mean two copies with nothing to say
 * which one wins when they disagree.
 *
 * Neither is signed yet — that is the next step, and it applies to a component's published header
 * rather than to this editing copy.
 */

const headerDirectory = join('.genoacms', 'components', 'headers/')
const validateComponentHeader = validator(componentHeaderSchema, { includeErrors: true })

const HISTORY_SUFFIX = '.history'

const headerPath = (reference: ComponentHeaderReference): string =>
  join(headerDirectory, `${reference}.json`)

const historyPath = (reference: ComponentHeaderReference): string =>
  join(headerDirectory, `${reference}${HISTORY_SUFFIX}`)

/**
 * Runs a storage operation that is allowed to find nothing there.
 *
 * Storage signals absence by **throwing**, so a caller that wants "or nothing" has to catch. That
 * covers reads whose object may not exist, and deletes of an object that may already be gone —
 * removing something that is not there is the state the caller wanted, not a failure. The
 * page tree does the same thing inline; this is the same pattern named, because two reads here need
 * it, and a read that cannot tell absence from failure would be the bug it exists to fix.
 *
 * The weakness is stated rather than hidden: a network fault is indistinguishable from an absent
 * object here, so it reads as absent. The clean fix is an `ObjectNotFoundError` in
 * `@genoacms/cloudabstraction` with an `isObjectNotFound` predicate, matching the
 * `PreconditionFailedError` already there — which means every adapter has to raise it, so it is a
 * change to the adapter contract rather than to this file.
 */
const toleratingAbsence = async <T>(operation: Promise<T>): Promise<T | undefined> => {
  try {
    return await operation
  } catch {
    return undefined
  }
}

/**
 * The reference a stored file belongs to, or `undefined` if it is not a header.
 *
 * The directory holds two files per component, so listing it and treating every filename as a
 * reference would report each component twice — once as itself and once as its own history.
 */
const referenceOf = (filename: string): ComponentHeaderReference | undefined => {
  if (filename.endsWith(HISTORY_SUFFIX)) return undefined
  return filename.endsWith('.json') ? filename.slice(0, -'.json'.length) : filename
}

const listOrCreateComponentHeaderList = async (): Promise<Array<ComponentHeader>> => {
  const listing = await listOrCreateDirectory({ bucket: defaultBucketId, name: headerDirectory })
  const references = listing.files
    .map(component => referenceOf(fullyQualifiedNameToFilename(component.name)))
    .filter((reference): reference is ComponentHeaderReference => reference !== undefined)
  const componentSchemas = await Promise.all(references.map(getComponentHeader))
  return componentSchemas.filter(schema => schema !== null) as Array<ComponentHeader>
}

/**
 * Reads the description, or nothing.
 *
 * One path, one form. Every older shape a header was stored in — the single flatted object that
 * carried its own history, the two-object form under `prebuilt/`, and headers written before
 * `attributeOrder` was required — is gone rather than repaired, and a component in any of them reads
 * as absent and has to be created again.
 */
const readHeader = async (reference: ComponentHeaderReference): Promise<Record<string, unknown> | undefined> =>
  await toleratingAbsence(getInternalObjectJSON(headerPath(reference))) as Record<string, unknown> | undefined

/**
 * A stored header, or `null` if there is nothing valid there.
 *
 * Absence and invalidity are deliberately the same answer to a caller: both mean the catalog has no
 * component to show, and neither is recoverable from here.
 */
const getComponentHeader = async (reference: ComponentHeaderReference): Promise<ComponentHeader | null> => {
  const stored = await readHeader(reference)
  if (stored === undefined || stored === null) return null
  if (!validateComponentHeader(stored as unknown as Json)) return null
  return stored as unknown as ComponentHeader
}

/** A component's editing history. Absent is empty, not an error: nothing has been undone yet. */
const getComponentHeaderHistory = async (
  reference: ComponentHeaderReference
): Promise<UndoRedoAdjunct<ComponentHeader>> => {
  const stored = await toleratingAbsence(getInternalObjectFlatted(historyPath(reference))) as
    Partial<UndoRedoAdjunct<ComponentHeader>> | undefined | null
  if (stored === undefined || stored === null) return noHistory<ComponentHeader>()
  if (!Array.isArray(stored.history) || !Array.isArray(stored.future)) {
    // A history that cannot be read is not worth failing an edit over — the description is intact,
    // and the worst outcome is that the author cannot undo past this point.
    console.warn(`[genoacms:components] ${reference} has an unreadable editing history; starting a new one`)
    return noHistory<ComponentHeader>()
  }
  return { history: stored.history, future: stored.future }
}

const uploadComponentHeader = async (header: ComponentHeader) =>
  await uploadInternalObjectJSON(headerPath(header.uid), header)

const uploadComponentHeaderHistory = async (
  reference: ComponentHeaderReference,
  adjunct: UndoRedoAdjunct<ComponentHeader>
) => await uploadInternalObjectFlatted(historyPath(reference), adjunct)

/**
 * Removes everything stored for a component.
 *
 * Both objects are tolerant of not being there: a component that was never edited has **no history
 * object**, and requiring one made deleting an ordinary component fail — removing a freshly created
 * component raised `No such object` on its absent history and the route answered 500 instead of
 * redirecting.
 *
 * The history is removed too. One outliving its component is unreachable state in the bucket, and
 * would be adopted by the next component to be given the same identifier.
 */
const deleteComponentHeader = async (reference: ComponentHeaderReference) => {
  await Promise.all([
    toleratingAbsence(deleteInternalObject(headerPath(reference))),
    toleratingAbsence(deleteInternalObject(historyPath(reference)))
  ])
}

export {
  listOrCreateComponentHeaderList,
  getComponentHeader,
  getComponentHeaderHistory,
  uploadComponentHeader,
  uploadComponentHeaderHistory,
  deleteComponentHeader
}
