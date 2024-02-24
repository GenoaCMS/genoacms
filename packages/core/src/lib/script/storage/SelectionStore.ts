import { writable, type Readable } from 'svelte/store'

interface SelectionStoreOptions {
  maxItems: number
}
interface SelectionOperations {
  values: Array<string>
  select: (reference: string) => void,
  isSelected: (reference: string) => boolean,
  canBeSelected: () => boolean
}

type SelectionStoreT = Readable<SelectionOperations>

function SelectionStore ({ maxItems }: SelectionStoreOptions): SelectionStoreT {
  const selectionMap: Set<string> = new Set()
  const selectionOperations: SelectionOperations = {
    values: [],
    select: (reference: string) => {
      if (selectionMap.has(reference)) {
        selectionMap.delete(reference)
        update()
        return
      }
      if (selectionMap.size >= maxItems) return
      selectionMap.add(reference)
      update()
    },
    isSelected: (reference: string) => {
      return selectionMap.has(reference)
    },
    canBeSelected: () => {
      return selectionMap.size < maxItems
    }
  }
  const { subscribe, update: storeUpdate } = writable(selectionOperations)
  const update = () => {
    storeUpdate(operations => {
      return {
        ...operations,
        values: Array.from(selectionMap.values())
      }
    })
  }
  return {
    subscribe
  }
}

export type {
  SelectionStoreT
}
export default SelectionStore
