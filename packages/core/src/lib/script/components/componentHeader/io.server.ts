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
 * Where a prebuilt component is stored, and why it is two objects rather than one.
 *
 * A header used to be a single flatted object carrying its own editing history. It is now split, so
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

const prebuiltSchemaPath = join('.genoacms', 'components', 'prebuilt/')
const validateComponentHeader = validator(componentHeaderSchema, { includeErrors: true })

const HISTORY_SUFFIX = '.history'

const entryPath = (reference: ComponentHeaderReference): string =>
  join(prebuiltSchemaPath, `${reference}.json`)

const historyPath = (reference: ComponentHeaderReference): string =>
  join(prebuiltSchemaPath, `${reference}${HISTORY_SUFFIX}`)

/**
 * Runs a storage operation that is allowed to find nothing there.
 *
 * Storage signals absence by **throwing**, so a caller that wants "or nothing" has to catch. That
 * covers reads whose object may not exist, and deletes of an object that may already be gone —
 * removing something that is not there is the state the caller wanted, not a failure. The
 * page tree does the same thing inline; this is the same pattern named, because two reads here need
 * it and a legacy fallback that cannot tell absence from failure would be the bug it exists to fix.
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
  const componentList = await listOrCreateDirectory({
    bucket: defaultBucketId,
    name: prebuiltSchemaPath
  })
  const references = componentList.files
    .map(component => referenceOf(fullyQualifiedNameToFilename(component.name)))
    .filter((reference): reference is ComponentHeaderReference => reference !== undefined)
  const componentSchemas = await Promise.all(references.map(getComponentHeader))
  return componentSchemas.filter(schema => schema !== null) as Array<ComponentHeader>
}

/**
 * Reads the description, falling back to the single flatted object entries used to be.
 *
 * Stated as a repair rather than hidden behind a default, and logged for the same reason the
 * attribute-order repair below is: it should stop happening, and once no component triggers it the
 * branch can go.
 */
const readEntry = async (reference: ComponentHeaderReference): Promise<Record<string, unknown> | undefined> => {
  const stored = await toleratingAbsence(getInternalObjectJSON(entryPath(reference))) as Record<string, unknown> | undefined
  if (stored !== undefined && stored !== null) return stored

  const legacy = await toleratingAbsence(getInternalObjectFlatted(join(prebuiltSchemaPath, reference))) as Record<string, unknown> | undefined
  if (legacy === undefined || legacy === null) return undefined

  console.warn(`[genoacms:components] ${reference} is stored in the old single-object form; reading its description out of it`)
  // The old object carried its history inline. Dropped rather than migrated: it was never read or
  // written by anything, so there is no history in it to preserve. Removed rather than ignored,
  // because the schema refuses a header carrying them.
  delete legacy.history
  delete legacy.future
  return legacy
}

const getComponentHeader = async (reference: ComponentHeaderReference): Promise<ComponentHeader | null> => {
  const stored = await readEntry(reference)
  if (stored === undefined) return null

  // Repairs headers written before `attributeOrder` existed, which are otherwise refused by the
  // schema that now requires it. Both writers supply it, so this fires only for those older
  // headers — and being able to say that is why it is a stated repair rather than a default.
  if (stored.attributeOrder === undefined) {
    // Logged, not silent. This is a migration, and the point of saying so is that it should stop
    // happening: once no header triggers it, the branch can go.
    console.warn(`[genoacms:components] ${reference} was stored without an attribute order; deriving one from its attributes`)
    stored.attributeOrder = Object.keys(stored.attributes ?? {})
  }

  if (!validateComponentHeader(stored as unknown as Json)) {
    return null
  }
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

const uploadComponentHeader = async (entry: ComponentHeader) =>
  await uploadInternalObjectJSON(entryPath(entry.uid), entry)

const uploadComponentHeaderHistory = async (
  reference: ComponentHeaderReference,
  adjunct: UndoRedoAdjunct<ComponentHeader>
) => await uploadInternalObjectFlatted(historyPath(reference), adjunct)

/**
 * Removes everything stored for a component.
 *
 * All three are tolerant of not being there, and each for its own reason. A component that was never
 * edited has **no history object**, one stored since the split has no legacy object, and one stored
 * before it has no `.json`. Requiring any of them to exist makes deleting an ordinary component fail
 * — which is what happened: removing a freshly created component raised `No such object` on its
 * absent history and the route answered 500 instead of redirecting.
 *
 * The history is removed too. One outliving its component is unreachable state in the bucket, and
 * would be adopted by the next component to be given the same identifier.
 */
const deleteComponentHeader = async (reference: ComponentHeaderReference) => {
  await toleratingAbsence(deleteInternalObject(entryPath(reference)))
  await toleratingAbsence(deleteInternalObject(historyPath(reference)))
  await toleratingAbsence(deleteInternalObject(join(prebuiltSchemaPath, reference)))
}

export {
  listOrCreateComponentHeaderList,
  getComponentHeader,
  getComponentHeaderHistory,
  uploadComponentHeader,
  uploadComponentHeaderHistory,
  deleteComponentHeader
}
