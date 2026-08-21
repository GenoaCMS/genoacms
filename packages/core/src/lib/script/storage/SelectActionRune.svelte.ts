import type { ObjectReference } from '@genoacms/cloudabstraction/storage'
import { SelectAction, type SelectionInitData } from '$lib/script/selection/SelectAction.svelte'
import selection, { type SelectionParameters } from './SelectionRune.svelte'

/**
 * The storage browser's half of a selection window.
 *
 * Everything but the binding lives in `SelectAction`. What is storage's own is the refusal to offer
 * directories: a field that takes a storage resource takes a file, and the opener is not entitled to
 * relax that.
 */
class SelectActionRune extends SelectAction<ObjectReference, SelectionParameters> {
  constructor (selectionId: string | null) {
    super(selectionId, selection, { allowDirectories: false })
  }
}

export type { SelectionInitData }
export { SelectActionRune }
export default SelectActionRune
