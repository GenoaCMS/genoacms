import type { ObjectReference } from '@genoacms/cloudabstraction/storage'
import { Selection } from '$lib/script/selection/Selection.svelte'

/**
 * The storage browser's selection.
 *
 * Membership, ordering and the item cap come from the shared `Selection`. What is storage's own is
 * kept here: whether directories may be selected, and the file/directory split a deletion prompt
 * reads out.
 *
 * A **module singleton**, because the browser and the picker windows that reuse it address one
 * selection per document rather than passing an instance down the tree.
 */

interface SelectionParameters {
  maxItems: number,
  allowDirectories: boolean
}

interface TypeCounts {
  directories: number,
  files: number
}

function isDirectory (reference: ObjectReference): boolean {
  return reference.name.endsWith('/')
}

class StorageSelection {
  #allowDirectories: boolean = $state(true)
  #selection = new Selection<ObjectReference>({
    // A reference is two fixed fields, so its JSON is a stable identity — the key this selection has
    // always used.
    canSelect: reference => this.#allowDirectories || !isDirectory(reference)
  })

  setParameters (parameters: Partial<SelectionParameters>): void {
    if (parameters.maxItems !== undefined) this.#selection.setMaxItems(parameters.maxItems)
    if (parameters.allowDirectories !== undefined) this.#allowDirectories = parameters.allowDirectories
  }

  get value (): ObjectReference[] {
    return this.#selection.value
  }

  get isEmpty (): boolean {
    return this.#selection.isEmpty
  }

  /** Whether there is room for another. Not whether a given item may be selected — that is the
   *  `canSelect` rule passed to the core, and conflating the two is why this is named for the
   *  question it actually answers. */
  get canSelectMore (): boolean {
    return this.#selection.canSelectMore
  }

  get allowDirectories (): boolean {
    return this.#allowDirectories
  }

  /** What a deletion prompt says out loud: "two directories and one file". */
  get countsByType (): TypeCounts {
    let directories = 0
    let files = 0
    for (const reference of this.value) {
      if (isDirectory(reference)) {
        directories++
      } else {
        files++
      }
    }
    return { directories, files }
  }

  /** Selects, or deselects when already selected. */
  toggle (reference: ObjectReference): void {
    this.#selection.toggle(reference)
  }

  selectAll (references: ObjectReference[]): void {
    this.#selection.selectAll(references)
  }

  isSelected (reference: ObjectReference): boolean {
    return this.#selection.isSelected(reference)
  }

  clear (): void {
    this.#selection.clear()
  }

  load (references: ObjectReference[] | undefined): void {
    this.#selection.load(references)
  }
}

export type { SelectionParameters, TypeCounts }
const selection = new StorageSelection()
export default selection
