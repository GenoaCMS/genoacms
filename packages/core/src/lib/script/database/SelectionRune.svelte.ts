import { Selection } from '$lib/script/selection/Selection.svelte'

/**
 * The collection browser's selection, over document references.
 *
 * A document reference is an array of path segments, so its JSON is its identity — the key this
 * selection has always used, now supplied by the shared `Selection` rather than restated.
 *
 * Nothing is added beyond the cap: unlike storage there is no second kind of thing to exclude, which
 * is why this is a facade rather than a subclass with behaviour of its own.
 */

type DocumentReference = string | number | Array<string | number>

interface SelectionParameters {
  maxItems: number
}

class DocumentSelection {
  #selection = new Selection<DocumentReference>()

  setParameters (parameters: Partial<SelectionParameters>): void {
    if (parameters.maxItems !== undefined) this.#selection.setMaxItems(parameters.maxItems)
  }

  get value (): DocumentReference[] {
    return this.#selection.value
  }

  get isEmpty (): boolean {
    return this.#selection.isEmpty
  }

  /** Whether there is room for another, which is the only limit a document list has. */
  get canSelectMore (): boolean {
    return this.#selection.canSelectMore
  }

  /** Selects, or deselects when already selected. */
  toggle (reference: DocumentReference): void {
    this.#selection.toggle(reference)
  }

  isSelected (reference: DocumentReference): boolean {
    return this.#selection.isSelected(reference)
  }

  clear (): void {
    this.#selection.clear()
  }

  load (references: DocumentReference[] | undefined): void {
    this.#selection.load(references)
  }
}

export type { SelectionParameters, DocumentReference }
const selection = new DocumentSelection()
export default selection
