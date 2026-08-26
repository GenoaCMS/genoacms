import type { ComponentDefinition, ComponentReference } from './types'
import type { UndoRedoAdjunct } from '$lib/script/undoRedo/types'

import {
  getComponentDefiniton,
  getComponentDefinitionHistory,
  uploadComponentDefinition,
  uploadComponentDefinitionHistory
} from './io'
import { recordChange, undo, redo } from '$lib/script/undoRedo'

/**
 * Editing a component's body, with the history that makes it reversible.
 *
 * **This is what replaced commits.** Marking reference points in the source was an act of its own,
 * stored, identified and permissioned; what an author actually wanted from it — a way back to the
 * code as it was a moment ago — is the same thing the page editor and the registrar already offer,
 * through the same `UndoRedoAdjunct`. Doing it here means one implementation of stepping backwards
 * rather than two, and the component editor stops being the one surface in the CMS with a lifecycle
 * of its own.
 *
 * The definition and its history are two stored objects, so every operation here touches both and
 * this is the only place that knows they belong together.
 *
 * ## The definition is the source of truth, the history is best effort
 *
 * There is no transaction across two objects, so a write can succeed and the next one fail. That is
 * resolved by always writing the **definition** first and the history second. The worst outcome is
 * then that an author loses undo depth, which is recoverable by editing again. The other order can
 * leave a history describing a change the definition never received — and applying it later would
 * corrupt the source rather than restore it.
 *
 * ## Only the body is ever recorded
 *
 * A step is the difference between two whole definitions, but the only member a save changes is
 * `body`, so a step only ever touches that path. `publishedBody`, `publishedSignature` and
 * `lastPublicationId` move when a component is **published**, which records no step — publishing is
 * not an edit and is not something undo reverses. An undo therefore cannot walk a component back to
 * claiming a publication it no longer has.
 */

/** What the editor needs to know about a history without loading the whole of it. */
interface HistoryDepth {
  historyLength: number
  futureLength: number
}

const depthOf = (adjunct: UndoRedoAdjunct<ComponentDefinition>): HistoryDepth => ({
  historyLength: adjunct.history.length,
  futureLength: adjunct.future.length
})

const getComponentDefinitionDepth = async (
  reference: ComponentReference
): Promise<HistoryDepth> => depthOf(await getComponentDefinitionHistory(reference))

/**
 * Saves an edited body and records the step that produced it.
 *
 * The previous state is read back from storage rather than taken from the client. A client that
 * reported its own "before" could report anything, and the recorded step is what an undo replays —
 * so trusting it would let a save write a history that reverts to a state that never existed.
 *
 * **A save that changes nothing records nothing.** `recordChange` already refuses an empty step, so
 * this is stated rather than implemented — but it is the property that makes pressing Save twice
 * harmless, and undoing once afterwards actually undo something.
 *
 * **Returns the resulting depth**, because saving is a remote call rather than a form action and so
 * nothing re-runs the page's `load`. Without it the editor keeps whatever depth it was rendered
 * with, and an author who has just typed is told there is nothing to undo until they reload.
 */
const saveComponentBody = async (
  reference: ComponentReference,
  body: string
): Promise<HistoryDepth> => {
  const previous = await getComponentDefiniton(reference)
  const adjunct = await getComponentDefinitionHistory(reference)

  // A copy, because `recordChange` diffs two objects and the stored one is about to be edited. The
  // header's equivalent is handed two distinct objects by its caller; here the caller supplies only
  // a string, so the pair has to be made rather than received.
  const saved: ComponentDefinition = { ...previous, body }
  await uploadComponentDefinition(saved)

  const recorded = recordChange(saved, adjunct, previous)
  await uploadComponentDefinitionHistory(reference, recorded)
  return depthOf(recorded)
}

/**
 * Steps one move through the history, in whichever direction.
 *
 * Both directions are the same three actions against the same two objects, differing only in which
 * operation runs — so they are written once. The operation edits the definition in place and returns
 * the history that results.
 */
const step = (move: typeof undo) =>
  async (reference: ComponentReference): Promise<ComponentDefinition> => {
    const definition = await getComponentDefiniton(reference)
    const adjunct = await getComponentDefinitionHistory(reference)
    const stepped = move(definition, adjunct)
    // Nothing to move through. Returned unchanged rather than written back, so that pressing undo at
    // the beginning of a history does not rewrite storage with what is already there.
    if (stepped === adjunct) return definition

    await uploadComponentDefinition(definition)
    await uploadComponentDefinitionHistory(reference, stepped)
    return definition
  }

const undoComponentBody = step(undo)
const redoComponentBody = step(redo)

export {
  saveComponentBody,
  undoComponentBody,
  redoComponentBody,
  getComponentDefinitionDepth
}
export type { HistoryDepth }
