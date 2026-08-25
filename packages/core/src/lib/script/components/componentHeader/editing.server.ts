import {
  getComponentHeader,
  getComponentHeaderHistory,
  uploadComponentHeader,
  uploadComponentHeaderHistory
} from './io.server'
import { recordChange, undo, redo } from '$lib/script/undoRedo'
import type { ComponentHeader, ComponentHeaderReference } from './component/types'
import type { UndoRedoAdjunct } from '$lib/script/undoRedo/types'

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

/**
 * Saves an edited description and records the step that produced it.
 *
 * The previous state is read back from storage rather than taken from the client. A client that
 * reported its own "before" could report anything, and the recorded step is what an undo replays —
 * so trusting it would let a save write a history that reverts to a state that never existed.
 *
 * A component with nothing stored yet has no step to record: there is no previous state to diff
 * against, and the creation itself is not something undo reverses.
 *
 * **Returns the resulting depth**, because saving is a remote call rather than a form action and so
 * nothing re-runs the page's `load`. Without it the editor keeps whatever depth it was rendered
 * with, and an author who has just made a change is told there is nothing to undo until they
 * reload.
 */
const saveComponentHeader = async (entry: ComponentHeader): Promise<HistoryDepth> => {
  const previous = await getComponentHeader(entry.uid)
  const adjunct = await getComponentHeaderHistory(entry.uid)

  await uploadComponentHeader(entry)
  if (previous === null) return depthOf(adjunct)

  const recorded = recordChange(entry, adjunct, previous)
  await uploadComponentHeaderHistory(entry.uid, recorded)
  return depthOf(recorded)
}

/**
 * Steps one move through the history, in whichever direction.
 *
 * Both directions are the same three actions against the same two objects, differing only in which
 * operation runs — so they are written once. The operation edits the description in place and
 * returns the history that results.
 */
const step = (move: typeof undo) =>
  async (reference: ComponentHeaderReference): Promise<ComponentHeader | null> => {
    const entry = await getComponentHeader(reference)
    if (entry === null) return null

    const adjunct = await getComponentHeaderHistory(reference)
    const stepped = move(entry, adjunct)
    // Nothing to move through. Returned unchanged rather than written back, so that pressing undo
    // at the beginning of a history does not rewrite storage with what is already there.
    if (stepped === adjunct) return entry

    await uploadComponentHeader(entry)
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
export type { HistoryDepth }
