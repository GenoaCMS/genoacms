import { Selection } from './Selection.svelte'

/**
 * A selection of named entries — components, pages — for acting on several at once.
 *
 * Everything about membership comes from `Selection`. What is added here is the one thing these
 * lists need and the others do not: a **name** per entry, because a bulk deletion is confirmed by
 * typing the selected names back.
 */

interface NamedEntry {
  /** What the operation names: a uid for components, a name for pages. */
  id: string
  /** What the person sees, and types to confirm. */
  name: string
}

class NamedSelection {
  #selection = new Selection<NamedEntry>({ key: entry => entry.id })

  get value (): NamedEntry[] {
    return this.#selection.value
  }

  get names (): string[] {
    return this.value.map(entry => entry.name)
  }

  get ids (): string[] {
    return this.value.map(entry => entry.id)
  }

  get size (): number {
    return this.#selection.size
  }

  get isEmpty (): boolean {
    return this.#selection.isEmpty
  }

  isSelected (id: string): boolean {
    // Addressed by id alone, because a list renders one checkbox per id and does not have the entry
    // to hand when asking.
    return this.#selection.isSelected({ id, name: '' })
  }

  toggle (entry: NamedEntry): void {
    this.#selection.toggle(entry)
  }

  selectAll (entries: NamedEntry[]): void {
    this.#selection.selectAll(entries)
  }

  clear (): void {
    this.#selection.clear()
  }
}

/**
 * The confirmation phrase for a bulk deletion: every selected name, in the order shown.
 *
 * Typing one name is enough when one thing is being deleted. For several it is not — the count is
 * the part people misjudge, and a single word confirms nothing about how much is about to go. Asking
 * for the whole sequence makes the size of the operation impossible to miss, and it cannot be
 * satisfied by habit.
 */
const confirmationPhrase = (names: string[]): string => names.join(', ')

/** Whitespace around the separators is forgiven; the names and their order are not. */
const matchesConfirmation = (typed: string, names: string[]): boolean => {
  const normalize = (value: string): string =>
    value.split(',').map(part => part.trim()).filter(part => part.length > 0).join(',')

  return normalize(typed) === normalize(confirmationPhrase(names))
}

export {
  NamedSelection,
  confirmationPhrase,
  matchesConfirmation
}

export type {
  NamedEntry
}
