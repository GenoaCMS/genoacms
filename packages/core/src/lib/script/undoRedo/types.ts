import type { Diff } from 'deep-diff'

/**
 * Editing history, stored beside the thing being edited rather than inside it.
 *
 * ## Why it is an adjunct and not a wrapper
 *
 * Two things in the CMS are edited with undo and redo — a page's contents and a component's
 * attributes — and both carried `history` and `future` as fields of their own. Wrapping the edited
 * thing in an envelope would fix the duplication and introduce a worse problem: the current state
 * would live inside the envelope, and the description of a component has to be stored **on its own**
 * so it can be published and signed. It would then exist in two files with nothing to say which one
 * wins when they disagree.
 *
 * An adjunct holds only what the description does not: the steps taken to reach it. Each fact is
 * stored once.
 *
 * - `{uid}.json` — the description. Plain JSON, because a consumer parses it.
 * - `{uid}.history` — this. Flatted, because a history is mostly repetition.
 *
 * The flatted form is measurably smaller here and not in general. It pools repeated strings, and a
 * diff's `path` carries attribute references, which are UUIDs — so the same 36 characters recur in
 * every step. Measured at roughly 90% of the JSON size for realistic histories. With short
 * human-readable keys the pooling overhead makes it *larger*, so this is a property of these
 * documents rather than of the format.
 *
 * ## A step is a list of differences, not one difference
 *
 * `history` is an array of **steps**, and a step is every difference an edit produced together. One
 * edit that renames an attribute and reorders it is one step, so it is undone in one press. Storing
 * differences ungrouped would flatten that: an author would undo the reorder, then press again for
 * the rename, with no indication of where their own edit began or ended.
 *
 * `history` reads oldest-first, so the last element is the most recent edit and undoing reverts it.
 * `future` holds what has been undone, most recently undone last.
 */

/** One editing step: everything that changed between two states of `T`. */
type Change<T> = Array<Diff<T>>

interface UndoRedoAdjunct<T> {
  /** Steps already applied, oldest first. Undoing reverts the last. */
  history: Array<Change<T>>
  /**
   * Steps that were undone, and can be applied again.
   *
   * Discarded whenever a new step is recorded: once the author edits from an undone state, the
   * branch they undid away from is unreachable, and its differences were computed against a state
   * that no longer exists.
   */
  future: Array<Change<T>>
}

export type { Change, UndoRedoAdjunct }
