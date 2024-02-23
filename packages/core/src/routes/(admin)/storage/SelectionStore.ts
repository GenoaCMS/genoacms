import { writable, type Readable } from 'svelte/store'
import type { ObjectReference } from '@genoacms/cloudabstraction/storage'

interface SelectionStoreOptions {
  maxItems: number
}
interface SelectionOperations {
  values: Array<ObjectReference>
  select: (reference: ObjectReference) => void,
  isSelected: (reference: ObjectReference) => boolean,
  canBeSelected: () => boolean
}

type SelectionStoreT = Readable<SelectionOperations>

function SelectionStore ({ maxItems }: SelectionStoreOptions): SelectionStoreT {
  const selectionMap: Set<ObjectReference> = new Set()
  const selectionOperations: SelectionOperations = {
    values: [],
    select: (reference: ObjectReference) => {
      if (selectionMap.has(reference)) {
        selectionMap.delete(reference)
        update()
        return
      }
      if (selectionMap.size >= maxItems) return
      selectionMap.add(reference)
      update()
    },
    isSelected: (reference: ObjectReference) => {
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
