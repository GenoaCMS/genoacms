import type { ObjectReference } from '@genoacms/cloudabstraction/storage'

interface SelectionParameters {
  maxItems: number
}

class Selection <T extends ObjectReference> {
  #selectionSet: Set<string> = new Set()
  #parameters: SelectionParameters = {
    maxItems: 0
  }

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
    return this.#selectionSet.values() === 0
  }

  get canSelect () {
    if (!this.#parameters.maxItems) return true
    return this.#selectionSet.size < this.#parameters.maxItems
  }

  select (reference: T) {
    const referenceString = JSON.stringify(reference)
    if (this.#selectionSet.has(referenceString)) {
      this.#selectionSet.delete(referenceString)
      return
    }
    if (!this.canSelect) return
    this.#selectionSet.add(referenceString)
  }

  isSelected (reference: T) {
    const referenceString = JSON.stringify(reference)
    return this.#selectionSet.has(referenceString)
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
export default Selection
