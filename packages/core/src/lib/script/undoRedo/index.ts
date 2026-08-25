import diff from 'deep-diff'
import type { Change, UndoRedoAdjunct } from './types'

/**
 * The four things an editing history can do, written once.
 *
 * These were the page editor's, inlined into `pageEntry` and duplicated nowhere else because the
 * component editor's equivalent was never written. Extracted so both have one implementation to
 * share, and so a component's description can be stored — and signed — without its history riding
 * along. See `types.ts` for why that separation matters.
 *
 * ## The state is passed in, and mutated
 *
 * An adjunct holds no current state, so every operation takes the state as its first argument.
 * `deep-diff` applies and reverts against an object in place, so that state is **edited rather than
 * replaced**. Copying it first would be the tidier contract and would cost a deep clone of the whole
 * page on every keystroke-sized edit, which is what a diff-based history exists to avoid.
 *
 * The adjunct is returned rather than mutated, because `future` is *cleared* rather than emptied and
 * a caller relying on mutation alone would silently miss it.
 */

/** An adjunct for something nothing has been done to yet. */
const noHistory = <T>(): UndoRedoAdjunct<T> => ({ history: [], future: [] })

/**
 * Records the step that took `previous` to `current`.
 *
 * Nothing is recorded when nothing changed. An empty step would still occupy a place in the history,
 * so undoing would appear to do nothing once for every save that changed nothing.
 */
const recordChange = <T>(
  current: T,
  adjunct: UndoRedoAdjunct<T>,
  previous: T
): UndoRedoAdjunct<T> => {
  const differences = diff.diff(previous, current) as Change<T> | undefined
  if (!differences) return adjunct

  return {
    history: [...adjunct.history, differences],
    // See the note on `future` in `types.ts`: editing from an undone state makes the abandoned
    // branch unreachable, and its differences were computed against a state that is now gone.
    future: []
  }
}

const undo = <T>(current: T, adjunct: UndoRedoAdjunct<T>): UndoRedoAdjunct<T> => {
  const lastStep = adjunct.history.at(-1)
  if (!lastStep) return adjunct

  for (const change of lastStep) {
    diff.revertChange(current, current, change)
  }
  return {
    history: adjunct.history.slice(0, -1),
    future: [...adjunct.future, lastStep]
  }
}

const redo = <T>(current: T, adjunct: UndoRedoAdjunct<T>): UndoRedoAdjunct<T> => {
  const nextStep = adjunct.future.at(-1)
  if (!nextStep) return adjunct

  for (const change of nextStep) {
    diff.applyChange(current, current, change)
  }
  return {
    history: [...adjunct.history, nextStep],
    future: adjunct.future.slice(0, -1)
  }
}

export { noHistory, recordChange, undo, redo }
export type { Change, UndoRedoAdjunct }
