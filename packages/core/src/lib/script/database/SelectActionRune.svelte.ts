import { SelectAction, type SelectionInitData } from '$lib/script/selection/SelectAction.svelte'
import selection, { type SelectionParameters, type DocumentReference } from './SelectionRune.svelte'

/**
 * The collection browser's half of a selection window.
 *
 * Nothing is forced here: a document list holds one kind of thing, so there is no counterpart to
 * storage's refusal of directories.
 */
class SelectActionRune extends SelectAction<DocumentReference, SelectionParameters> {
  constructor (selectionId: string | null) {
    super(selectionId, selection)
  }
}

export type { SelectionInitData }
export { SelectActionRune }
export default SelectActionRune
