import type { ObjectReference } from '@genoacms/cloudabstraction/storage'
import { SvelteSet } from 'svelte/reactivity'

interface SelectionParameters {
  maxItems: number,
  allowDirectories: boolean
}

interface TypeCounts {
  directories: number,
  files: number
}

function isDirectory (ref: ObjectReference) {
  return ref.name.endsWith('/')
}

class Selection <T extends ObjectReference> {
  #selectionSet: Set<string> = new SvelteSet()
  #parameters: SelectionParameters = $state({
    maxItems: 0,
    allowDirectories: true
  })

  setParameters (parameters: SelectionParameters) {
    this.#parameters = {
      ...this.#parameters,
      ...parameters
    }
  }

  get value (): Array<T> {
    const referenceStrings = Array.from(this.#selectionSet.values())
    return referenceStrings.map(item => JSON.parse(item))
  }

  get isEmpty (): boolean {
    return this.#selectionSet.size === 0
  }

  get canSelect () {
    if (!this.#parameters.maxItems) return true
    return this.#selectionSet.size < this.#parameters.maxItems
  }

  get allowDirectories () {
    return this.#parameters.allowDirectories
  }

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

  select (reference: T) {
    if (!this.canSelect ||
      (!this.allowDirectories && isDirectory(reference))) return
    const referenceString = JSON.stringify(reference)
    if (this.#selectionSet.has(referenceString)) {
      this.#selectionSet.delete(referenceString)
      return
    }
    this.#selectionSet.add(referenceString)
  }

  bulkSelect (references: Array<T>) {
    for (const reference of references) {
      this.select(reference)
    }
  }

  isSelected (reference: T) {
    const referenceString = JSON.stringify(reference)
    return this.#selectionSet.has(referenceString)
  }

  clear () {
    this.#selectionSet.clear()
  }

  load (selection: Array<T> | undefined) {
    if (!selection) return
    for (const reference of selection) {
      const referenceString = JSON.stringify(reference)
      this.#selectionSet.add(referenceString)
    }
  }
}

export type { SelectionParameters }
const selection = new Selection()
export default selection
