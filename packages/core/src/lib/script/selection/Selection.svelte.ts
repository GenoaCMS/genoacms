import { SvelteMap, SvelteSet } from 'svelte/reactivity'

/**
 * Selecting several things at once, wherever the CMS lists things.
 *
 * Four surfaces need this — the storage browser, the collection document list, the prebuilt
 * component catalogue and the page list — and three of them had grown their own copy: the same
 * reactive set, the same JSON key, the same toggle, differing only in what they select and which
 * extras they bolted on. This is that shared core, written once.
 *
 * **What stays with each surface is policy, not mechanism.** Whether a directory may be selected,
 * how a document reference is spelled, what a confirmation phrase reads like — those belong to the
 * surface. Membership, ordering and the cap belong here.
 *
 * **Insertion order is preserved**, because one caller confirms a bulk deletion by asking for the
 * selected names in the order they were shown. A `Set` keeps insertion order, so this costs nothing
 * and the other callers are indifferent to it.
 */

interface SelectionOptions<T> {
  /**
   * A stable string identity for an item. Defaults to its JSON.
   *
   * JSON is a fine key for a reference object whose field order is fixed by construction, which is
   * how the storage and collection selections have always keyed theirs.
   */
  key?: (item: T) => string
  /** The most that may be selected at once. `0` means no limit. */
  maxItems?: number
  /** Items this surface refuses to select at all — a directory, where only files are wanted. */
  canSelect?: (item: T) => boolean
}

class Selection<T> {
  #keys: Set<string> = new SvelteSet()
  #items: Map<string, T> = new SvelteMap()
  #key: (item: T) => string
  #maxItems: number = $state(0)
  #canSelect: (item: T) => boolean

  constructor (options: SelectionOptions<T> = {}) {
    this.#key = options.key ?? ((item: T) => JSON.stringify(item))
    this.#maxItems = options.maxItems ?? 0
    this.#canSelect = options.canSelect ?? (() => true)
  }

  /** The selected items, in the order they were selected. */
  get value (): T[] {
    return [...this.#keys].map(key => this.#items.get(key) as T)
  }

  get size (): number {
    return this.#keys.size
  }

  get isEmpty (): boolean {
    return this.#keys.size === 0
  }

  /** Whether there is room for one more. Callers show or hide a checkbox with it. */
  get canSelectMore (): boolean {
    if (!this.#maxItems) return true
    return this.#keys.size < this.#maxItems
  }

  setMaxItems (maxItems: number): void {
    this.#maxItems = maxItems
  }

  isSelected (item: T): boolean {
    return this.#keys.has(this.#key(item))
  }

  /**
   * Selects, or deselects when already selected.
   *
   * **Deselecting is checked first, and that ordering is the point.** Testing the cap before the
   * toggle means a full selection cannot be undone — every checkbox stops responding at exactly the
   * moment the user needs to clear one. The storage selection had that defect; it does not survive
   * the move here.
   */
  toggle (item: T): void {
    const key = this.#key(item)
    if (this.#keys.has(key)) {
      this.#keys.delete(key)
      this.#items.delete(key)
      return
    }
    if (!this.canSelectMore || !this.#canSelect(item)) return

    this.#items.set(key, item)
    this.#keys.add(key)
  }

  /** Adds every item that may be added. Additive: an already-selected item is left selected. */
  selectAll (items: T[]): void {
    for (const item of items) {
      if (this.isSelected(item)) continue
      this.toggle(item)
    }
  }

  /** Seeds the selection, for a picker opened with something already chosen. */
  load (items: T[] | undefined): void {
    if (!items) return
    this.selectAll(items)
  }

  clear (): void {
    this.#keys.clear()
    this.#items.clear()
  }
}

export { Selection }

export type { SelectionOptions }
