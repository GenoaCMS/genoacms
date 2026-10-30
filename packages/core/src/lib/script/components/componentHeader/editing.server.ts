import {
  getComponentHeader,
  getComponentHeaderVersioned,
  getComponentHeaderHistory,
  uploadComponentHeader,
  uploadComponentHeaderHistory
} from './io.server'
import { recordChange, undo, redo } from '#lib/script/undoRedo/index.js'
import {
  requireDistinctAttributeNames,
  requireUnreservedAttributeNames
} from './component/attributeNames'
import type { ComponentHeader, ComponentHeaderReference } from './component/types'
import type { UndoRedoAdjunct } from '#lib/script/undoRedo/types.js'
import { writeConditionally, requireCurrent } from '../conflict'
import { NoSuchComponentError } from '../editor/errors'

/**
 * Editing a prebuilt component, with the history that makes it reversible.
 *
 * The description and its history are two stored objects, so every operation here touches both and
 * this is the only place that knows they belong together. The route actions call these; they do not
 * assemble a save out of storage primitives.
 *
 * ## The description is the source of truth, the history is best effort
 *
 * There is no transaction across two objects, so a write can succeed and the next one fail. That is
 * resolved by always writing the **description** first and the history second. The worst outcome is
 * then that an author loses undo depth, which is recoverable by editing again. The other order can
 * leave a history describing a change the description never received — and applying it later would
 * corrupt the component rather than restore it.
 */

/** What the editor needs to know about a component's history without loading the whole of it. */
interface HistoryDepth {
  historyLength: number
  futureLength: number
}

const depthOf = (adjunct: UndoRedoAdjunct<ComponentHeader>): HistoryDepth => ({
  historyLength: adjunct.history.length,
  futureLength: adjunct.future.length
})

const getComponentHeaderDepth = async (reference: ComponentHeaderReference): Promise<HistoryDepth> =>
  depthOf(await getComponentHeaderHistory(reference))

const objectOf = (reference: ComponentHeaderReference): string => `component ${reference}`

/** HIS-2: the version the stored header has now, which is what a successful write has just made. */
const currentVersion = async (reference: ComponentHeaderReference): Promise<string | undefined> =>
  (await getComponentHeaderVersioned(reference))?.version

/** A header saved or stepped, the depth of its history, and the version it now has. */
interface HeaderSaved extends HistoryDepth {
  version: string | undefined
}

/**
 * Saves an edited description, conditionally on `version`, and records the step that produced it.
 *
 * The previous state is read back from storage rather than taken from the client. A client that
 * reported its own "before" could report anything, and the recorded step is what an undo replays —
 * so trusting it would let a save write a history that reverts to a state that never existed.
 *
 * CMP-8: only a component that exists is saved, and it keeps its stored kind.
 *
 * **Returns the resulting depth and version**, because saving is a remote call rather than a form
 * action and so nothing re-runs the page's `load`.
 */
const saveComponentHeader = async (entry: ComponentHeader, version: string): Promise<HeaderSaved> => {
  // Before anything is read or written. A published page keys each value by its attribute's name, so
  // two attributes sharing one silently lose a value with every signature over the result still
  // valid — and this is the one place both kinds of component are written through.
  requireDistinctAttributeNames(entry)
  requireUnreservedAttributeNames(entry)

  const previous = await getComponentHeader(entry.uid)
  if (previous === null) {
    throw new NoSuchComponentError(entry.uid, `components/no-such-component: ${entry.uid} does not exist.`)
  }
  const saved: ComponentHeader = { ...entry, type: previous.type }
  const adjunct = await getComponentHeaderHistory(entry.uid)

  await writeConditionally(async options => { await uploadComponentHeader(saved, options) }, objectOf(entry.uid), version)

  const recorded = recordChange(saved, adjunct, previous)
  await uploadComponentHeaderHistory(entry.uid, recorded)
  return { ...depthOf(recorded), version: await currentVersion(entry.uid) }
}

/**
 * Steps one move through the history, in whichever direction.
 *
 * Both directions are the same three actions against the same two objects, differing only in which
 * operation runs — so they are written once. The operation edits the description in place and
 * returns the history that results.
 */
const step = (move: typeof undo) =>
  async (reference: ComponentHeaderReference, version: string): Promise<ComponentHeader | null> => {
    const entry = await getComponentHeader(reference)
    if (entry === null) return null

    const adjunct = await getComponentHeaderHistory(reference)
    const stepped = move(entry, adjunct)
    // Nothing to move through. Returned unchanged rather than written back, so that pressing undo
    // at the beginning of a history does not rewrite storage with what is already there.
    if (stepped === adjunct) {
      requireCurrent(objectOf(reference), version, await currentVersion(reference))
      return entry
    }

    await writeConditionally(async options => { await uploadComponentHeader(entry, options) }, objectOf(reference), version)
    await uploadComponentHeaderHistory(reference, stepped)
    return entry
  }

const undoComponentHeader = step(undo)
const redoComponentHeader = step(redo)

export {
  saveComponentHeader,
  undoComponentHeader,
  redoComponentHeader,
  getComponentHeaderDepth
}
export type { HistoryDepth, HeaderSaved }
